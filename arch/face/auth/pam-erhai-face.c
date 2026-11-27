#define _GNU_SOURCE
#include <security/pam_modules.h>
#include <security/pam_ext.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include "face-protocol.h"

PAM_EXTERN int pam_sm_authenticate(pam_handle_t *pamh, int flags,
                                   int argc, const char **argv) {
    (void)argc;
    (void)argv;
    if ((flags & PAM_SILENT) || geteuid() != 0)
        return PAM_AUTHINFO_UNAVAIL;
    const char *user = NULL;
    const void *service = NULL, *host = NULL;
    if (pam_get_user(pamh, &user, NULL) != PAM_SUCCESS || !user ||
        pam_get_item(pamh, PAM_SERVICE, &service) != PAM_SUCCESS || !service ||
        pam_get_item(pamh, PAM_RHOST, &host) != PAM_SUCCESS ||
        (host && *(const char *)host))
        return PAM_AUTHINFO_UNAVAIL;
    struct face_request request = {0};
    if (strlen(user) >= sizeof(request.user) ||
        strlen(service) >= sizeof(request.service))
        return PAM_AUTH_ERR;
    strcpy(request.user, user);
    strcpy(request.service, service);
    int fd = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0);
    if (fd < 0)
        return PAM_AUTHINFO_UNAVAIL;
    struct sockaddr_un address = {.sun_family = AF_UNIX, .sun_path = FACE_SOCKET};
    struct timeval timeout = {.tv_sec = 50};
    int result = PAM_AUTHINFO_UNAVAIL;
    if (setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) < 0 ||
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout)) < 0 ||
        connect(fd, (struct sockaddr *)&address, sizeof(address)) < 0)
        goto finish;
    struct ucred server;
    socklen_t server_size = sizeof(server);
    if (getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &server, &server_size) < 0 || server.uid != 0)
        goto finish;
    char control[CMSG_SPACE(sizeof(int))] = {0};
    struct iovec io = {.iov_base = &request, .iov_len = sizeof(request)};
    struct msghdr message = {.msg_iov = &io, .msg_iovlen = 1,
        .msg_control = control, .msg_controllen = sizeof(control)};
    struct cmsghdr *header = CMSG_FIRSTHDR(&message);
    header->cmsg_level = SOL_SOCKET;
    header->cmsg_type = SCM_RIGHTS;
    header->cmsg_len = CMSG_LEN(sizeof(int));
    const int input = STDIN_FILENO;
    memcpy(CMSG_DATA(header), &input, sizeof(input));
    if (sendmsg(fd, &message, MSG_NOSIGNAL) != sizeof(request))
        goto finish;
    int reply;
    if (recv(fd, &reply, sizeof(reply), MSG_TRUNC) != sizeof(reply))
        goto finish;
    if (reply == FACE_RECOGNIZING) {
        if (pam_info(pamh, "Attempting facial authentication") != PAM_SUCCESS)
            goto finish;
        if (recv(fd, &reply, sizeof(reply), MSG_TRUNC) != sizeof(reply))
            goto finish;
    }
    result = reply == PAM_SUCCESS ? PAM_SUCCESS : PAM_AUTH_ERR;
finish:
    close(fd);
    return result;
}

PAM_EXTERN int pam_sm_setcred(pam_handle_t *pamh, int flags,
                              int argc, const char **argv) {
    (void)pamh; (void)flags; (void)argc; (void)argv;
    return PAM_SUCCESS;
}
