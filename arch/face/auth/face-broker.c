#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/major.h>
#include <linux/vt.h>
#include <poll.h>
#include <pwd.h>
#include <security/pam_appl.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/ioctl.h>
#include <sys/pidfd.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/sysmacros.h>
#include <sys/wait.h>
#include <systemd/sd-bus.h>
#include <systemd/sd-login.h>
#include <time.h>
#include <unistd.h>
#include "face-protocol.h"

#define UI_PATH "/org/erhai/FaceAuthentication"
#define UI_INTERFACE "org.erhai.FaceAuthentication"
#define UI_NAME "org.erhai.FaceAuthentication"

static void require(bool condition, const char *message) {
    if (!condition) {
        fprintf(stderr, "面容认证拒绝：%s\n", message);
        exit(EXIT_FAILURE);
    }
}

static bool alive(int pidfd) {
    struct pollfd descriptor = {.fd = pidfd, .events = POLLIN};
    return poll(&descriptor, 1, 0) == 0;
}

static bool executable(int pidfd, const char *expected) {
    char path[64], actual[512];
    pid_t pid = pidfd_getpid(pidfd);
    if (pid < 0)
        return false;
    snprintf(path, sizeof(path), "/proc/%d/exe", pid);
    ssize_t length = readlink(path, actual, sizeof(actual) - 1);
    if (length < 0)
        return false;
    actual[length] = '\0';
    return !strcmp(actual, expected) && alive(pidfd);
}

static bool unlocked(sd_bus *bus, const char *session, uid_t uid) {
    uid_t owner;
    if (sd_session_get_uid(session, &owner) < 0 || owner != uid ||
        sd_session_is_active(session) != 1 || sd_session_is_remote(session) != 0)
        return false;
    char *seat = NULL;
    bool local = sd_session_get_seat(session, &seat) >= 0 && !strcmp(seat, "seat0");
    free(seat);
    if (!local)
        return false;
    sd_bus_message *reply = NULL;
    int status = sd_bus_call_method(bus, "org.freedesktop.login1",
        "/org/freedesktop/login1", "org.freedesktop.login1.Manager", "GetSession",
        NULL, &reply, "s", session);
    const char *path = NULL;
    int locked = 1;
    if (status >= 0 && sd_bus_message_read(reply, "o", &path) >= 0)
        status = sd_bus_get_property_trivial(bus, "org.freedesktop.login1", path,
            "org.freedesktop.login1.Session", "LockedHint", NULL, 'b', &locked);
    sd_bus_message_unref(reply);
    return status >= 0 && !locked;
}

static bool local_vt(int requester, int input) {
    char *unit = NULL;
    bool getty = sd_pidfd_get_unit(requester, &unit) >= 0 &&
        !strncmp(unit, "getty@tty", 9);
    free(unit);
    struct stat info;
    if (!getty || fstat(input, &info) < 0 || !S_ISCHR(info.st_mode) ||
        major(info.st_rdev) != TTY_MAJOR || minor(info.st_rdev) < 1 ||
        minor(info.st_rdev) > 63)
        return false;
    struct vt_stat state;
    int console = open("/dev/tty0", O_RDONLY | O_CLOEXEC | O_NOCTTY);
    if (console < 0)
        return false;
    bool active = ioctl(console, VT_GETSTATE, &state) == 0 &&
        state.v_active == minor(info.st_rdev);
    close(console);
    return active && alive(requester);
}

static int quiet_conversation(int count, const struct pam_message **messages,
                              struct pam_response **responses, void *data) {
    (void)data;
    for (int index = 0; index < count; index++)
        if (messages[index]->msg_style != PAM_TEXT_INFO &&
            messages[index]->msg_style != PAM_ERROR_MSG)
            return PAM_CONV_ERR;
    *responses = calloc((size_t)count, sizeof(**responses));
    return *responses ? PAM_SUCCESS : PAM_BUF_ERR;
}

static void ui_state(sd_bus *bus, const char *owner, const char *token, const char *state) {
    require(sd_bus_call_method(bus, owner, UI_PATH, UI_INTERFACE,
        "Update", NULL, NULL, "ss", token, state) >= 0, "桌面状态通知失败");
}

static bool ui_active(sd_bus *bus, const char *owner, const char *token) {
    sd_bus_message *reply = NULL;
    int active = 0;
    int result = sd_bus_call_method(bus, owner, UI_PATH, UI_INTERFACE,
        "Check", NULL, &reply, "s", token);
    if (result >= 0)
        result = sd_bus_message_read(reply, "b", &active);
    sd_bus_message_unref(reply);
    return result >= 0 && active;
}

struct confirmation {
    bool finished;
    int approved;
};

static int confirmed(sd_bus_message *message, void *data, sd_bus_error *error) {
    (void)error;
    struct confirmation *confirmation = data;
    confirmation->finished = true;
    if (!sd_bus_message_is_method_error(message, NULL))
        sd_bus_message_read(message, "b", &confirmation->approved);
    return 0;
}

static bool disconnected(int fd) {
    struct pollfd descriptor = {.fd = fd, .events = POLLRDHUP};
    return poll(&descriptor, 1, 0) != 0;
}

int main(void) {
    require(getuid() == 0 && geteuid() == 0, "服务必须由 root 启动");
    require(prctl(PR_SET_CHILD_SUBREAPER, 1) == 0, "无法管理识别进程");
    int requester = -1;
    socklen_t size = sizeof(requester);
    struct ucred credentials;
    socklen_t credential_size = sizeof(credentials);
    require(getsockopt(0, SOL_SOCKET, SO_PEERPIDFD, &requester, &size) == 0 &&
        getsockopt(0, SOL_SOCKET, SO_PEERCRED, &credentials, &credential_size) == 0 &&
        credentials.uid == 0, "连接者身份无效");
    struct face_request request;
    char control[CMSG_SPACE(sizeof(int))] = {0};
    struct iovec io = {.iov_base = &request, .iov_len = sizeof(request)};
    struct msghdr message = {.msg_iov = &io, .msg_iovlen = 1,
        .msg_control = control, .msg_controllen = sizeof(control)};
    struct pollfd incoming = {.fd = 0, .events = POLLIN};
    require(poll(&incoming, 1, 3000) == 1, "请求没有及时到达");
    require(recvmsg(0, &message, MSG_CMSG_CLOEXEC | MSG_TRUNC) == sizeof(request) &&
        !(message.msg_flags & (MSG_TRUNC | MSG_CTRUNC)), "请求长度无效");
    struct cmsghdr *header = CMSG_FIRSTHDR(&message);
    require(header && header->cmsg_level == SOL_SOCKET && header->cmsg_type == SCM_RIGHTS &&
        header->cmsg_len == CMSG_LEN(sizeof(int)) && !CMSG_NXTHDR(&message, header),
        "缺少真实输入描述符");
    int input;
    memcpy(&input, CMSG_DATA(header), sizeof(input));
    require(memchr(request.user, '\0', sizeof(request.user)) &&
        memchr(request.service, '\0', sizeof(request.service)), "请求字符串无效");
    bool polkit = !strcmp(request.service, "polkit-1");
    bool login = !strcmp(request.service, "login");
    const char *expected = polkit ? "/usr/lib/polkit-1/polkit-agent-helper-1" :
        login ? "/usr/bin/login" :
        (!strcmp(request.service, "sudo") || !strcmp(request.service, "sudo-i")) ? "/usr/bin/sudo" :
        (!strcmp(request.service, "su") || !strcmp(request.service, "su-l")) ? "/usr/bin/su" : NULL;
    require(expected && executable(requester, expected), "认证入口与进程不匹配");
    struct passwd *account = getpwuid(1000);
    require(account && !strcmp(request.user, account->pw_name),
        "目标账户没有启用系统面容认证");
    uid_t uid = account->pw_uid;
    int origin = requester;
    if (polkit) {
        struct ucred agent;
        size = sizeof(origin);
        credential_size = sizeof(agent);
        require(getsockopt(input, SOL_SOCKET, SO_PEERPIDFD, &origin, &size) == 0 &&
            getsockopt(input, SOL_SOCKET, SO_PEERCRED, &agent, &credential_size) == 0 &&
            agent.uid == uid && executable(origin, "/usr/bin/gnome-shell"),
            "Polkit 认证代理身份无效");
    }
    sd_bus *system = NULL, *desktop = NULL;
    char *ui_owner = NULL;
    int shell_pidfd = -1;
    require(sd_bus_open_system(&system) >= 0, "无法连接系统会话服务");
    sd_bus_set_method_call_timeout(system, 200000);
    char *session = NULL;
    bool console_login = login && local_vt(requester, input);
    bool graphical = false;
    if (!console_login) {
        if (sd_pidfd_get_session(origin, &session) < 0) {
            uid_t owner;
            require(sd_pidfd_get_owner_uid(origin, &owner) >= 0 && owner == uid &&
                sd_uid_get_display(uid, &session) >= 0, "请求没有可验证的本地会话");
        }
        require(unlocked(system, session, uid), "会话远程、锁定或未激活");
        char *type = NULL;
        require(sd_session_get_type(session, &type) >= 0, "会话类型未知");
        graphical = !strcmp(type, "wayland") || !strcmp(type, "x11");
        free(type);
        require(!polkit || graphical, "Polkit 没有图形会话");
    }
    // 共享用户服务无法单凭用户编号判定来源，图形请求必须由桌面本人确认。
    char token[64];
    snprintf(token, sizeof(token), "%d-%d", getpid(), credentials.pid);
    if (graphical) {
        require(sd_bus_open_system(&desktop) >= 0,
            "无法连接桌面认证界面");
        sd_bus_set_method_call_timeout(desktop, 30000000);
        sd_bus_creds *shell = NULL;
        require(sd_bus_get_name_creds(desktop, UI_NAME,
            SD_BUS_CREDS_PIDFD | SD_BUS_CREDS_EUID | SD_BUS_CREDS_UNIQUE_NAME,
            &shell) >= 0, "桌面服务身份未知");
        uid_t shell_uid;
        const char *owner;
        require(sd_bus_creds_get_euid(shell, &shell_uid) >= 0 && shell_uid == uid &&
            sd_bus_creds_get_unique_name(shell, &owner) >= 0,
            "桌面服务账户不匹配");
        ui_owner = strdup(owner);
        require(ui_owner != NULL, "无法保存桌面连接身份");
        require(sd_bus_creds_get_pidfd_dup(shell, &shell_pidfd) >= 0 &&
            executable(shell_pidfd, "/usr/bin/gnome-shell"),
            "桌面服务进程不匹配");
        char *shell_unit = NULL;
        require(sd_pidfd_get_user_unit(shell_pidfd, &shell_unit) >= 0 &&
            !strcmp(shell_unit, "org.gnome.Shell@user.service"), "认证界面没有运行在 GNOME 桌面服务中");
        free(shell_unit);
        if (polkit)
            require(pidfd_getpid(origin) == pidfd_getpid(shell_pidfd) && alive(origin), "授权代理与桌面不匹配");
        sd_bus_creds_unref(shell);
        struct confirmation confirmation = {0};
        sd_bus_slot *pending = NULL;
        require(sd_bus_call_method_async(desktop, &pending, ui_owner, UI_PATH, UI_INTERFACE,
            "Begin", confirmed, &confirmation, "sss", token, request.service, request.user) >= 0,
            "桌面确认请求失败");
        struct timespec begin, current;
        clock_gettime(CLOCK_MONOTONIC, &begin);
        while (!confirmation.finished) {
            int processed;
            do {
                processed = sd_bus_process(desktop, NULL);
            } while (processed > 0);
            require(processed >= 0, "桌面确认通道已关闭");
            clock_gettime(CLOCK_MONOTONIC, &current);
            require(current.tv_sec - begin.tv_sec < 30 && alive(shell_pidfd) &&
                alive(requester) && alive(origin) && !disconnected(0) &&
                (!polkit || !disconnected(input)) && unlocked(system, session, uid),
                "桌面确认请求已经取消");
            if (!confirmation.finished) {
                struct pollfd event = {.fd = sd_bus_get_fd(desktop), .events = POLLIN};
                require(poll(&event, 1, 100) >= 0, "桌面确认等待失败");
            }
        }
        sd_bus_slot_unref(pending);
        require(confirmation.approved && alive(shell_pidfd) && alive(requester) && unlocked(system, session, uid),
            "本人没有在桌面确认面容认证");
        sd_bus_set_method_call_timeout(desktop, 200000);
    } else if (!console_login) {
        char *direct_session = NULL;
        require(sd_pidfd_get_session(requester, &direct_session) >= 0 &&
            !strcmp(direct_session, session), "终端请求缺少直接本地会话");
        free(direct_session);
    }
    int lock = open("/run/erhai-face/camera.lock", O_CREAT | O_RDWR | O_CLOEXEC, 0600);
    require(lock >= 0 && flock(lock, LOCK_EX | LOCK_NB) == 0, "摄像头正在进行另一项认证");
    int notice = FACE_RECOGNIZING;
    if (!graphical)
        require(send(0, &notice, sizeof(notice), MSG_NOSIGNAL) == sizeof(notice), "认证请求已经结束");
    if (desktop)
        ui_state(desktop, ui_owner, token, "recognizing");
    int result_pipe[2];
    require(pipe2(result_pipe, O_CLOEXEC) == 0, "无法建立识别结果通道");
    pid_t child = fork();
    require(child >= 0, "无法创建识别进程");
    if (child == 0) {
        close(0);
        close(input);
        close(result_pipe[0]);
        require(setsid() >= 0 && prctl(PR_SET_PDEATHSIG, SIGKILL) == 0 && getppid() != 1,
            "无法绑定识别生命周期");
        struct pam_conv conversation = {.conv = quiet_conversation};
        pam_handle_t *handle = NULL;
        int result = pam_start("erhai-face-backend", request.user, &conversation, &handle);
        if (result == PAM_SUCCESS)
            result = pam_authenticate(handle, 0);
        if (handle)
            pam_end(handle, result);
        require(write(result_pipe[1], &result, sizeof(result)) == sizeof(result), "无法交付识别结果");
        _exit(result == PAM_SUCCESS ? 0 : 1);
    }
    close(result_pipe[1]);
    struct pollfd watch[] = {
        {.fd = 0, .events = POLLRDHUP},
        {.fd = requester, .events = POLLIN},
        {.fd = origin, .events = POLLIN},
        {.fd = result_pipe[0], .events = POLLIN},
        {.fd = polkit ? input : -1, .events = POLLRDHUP},
    };
    int result = PAM_AUTH_ERR;
    int status = 0;
    bool reaped = false, received = false;
    struct timespec start, now;
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (;;) {
        require(poll(watch, 5, 100) >= 0, "识别状态等待失败");
        clock_gettime(CLOCK_MONOTONIC, &now);
        if (watch[0].revents || watch[1].revents || watch[2].revents || watch[4].revents ||
            now.tv_sec - start.tv_sec >= 15 ||
            (desktop && (!alive(shell_pidfd) || !ui_active(desktop, ui_owner, token))) ||
            (console_login ? !local_vt(requester, input) : !unlocked(system, session, uid)))
            break;
        if (!received && watch[3].revents) {
            if (read(result_pipe[0], &result, sizeof(result)) != sizeof(result))
                result = PAM_AUTH_ERR;
            received = true;
        }
        siginfo_t finished = {0};
        require(waitid(P_PID, child, &finished, WEXITED | WNOHANG | WNOWAIT) == 0,
            "识别进程状态无效");
        if (finished.si_pid == child) {
            if (!received) {
                if (read(result_pipe[0], &result, sizeof(result)) != sizeof(result))
                    result = PAM_AUTH_ERR;
                received = true;
            }
            reaped = true;
            break;
        }
    }
    // 认证结束时终止整个识别进程组，随后回收被收养的子进程。
    kill(-child, SIGKILL);
    if (!reaped) {
        kill(child, SIGKILL);
        result = PAM_AUTH_ERR;
    }
    require(waitpid(child, &status, 0) == child, "无法回收识别进程");
    while (waitpid(-1, NULL, 0) > 0) {}
    if (result == PAM_SUCCESS && (!received || !WIFEXITED(status) || WEXITSTATUS(status) != 0 ||
        !alive(requester) || !alive(origin) ||
        disconnected(0) || (polkit && disconnected(input)) ||
        (desktop && (!alive(shell_pidfd) || !ui_active(desktop, ui_owner, token))) ||
        (console_login ? !local_vt(requester, input) : !unlocked(system, session, uid))))
        result = PAM_AUTH_ERR;
    if (desktop)
        ui_state(desktop, ui_owner, token, result == PAM_SUCCESS ? "success" : "password");
    if (result == PAM_SUCCESS && (disconnected(0) || !alive(requester) || !alive(origin) ||
        (polkit && disconnected(input)) || (desktop && !alive(shell_pidfd))))
        result = PAM_AUTH_ERR;
    require(send(0, &result, sizeof(result), MSG_NOSIGNAL) == sizeof(result), "认证请求已经取消");
    sd_bus_unref(desktop);
    sd_bus_unref(system);
    free(session);
    free(ui_owner);
    if (shell_pidfd >= 0)
        close(shell_pidfd);
    return result == PAM_SUCCESS ? EXIT_SUCCESS : EXIT_FAILURE;
}
