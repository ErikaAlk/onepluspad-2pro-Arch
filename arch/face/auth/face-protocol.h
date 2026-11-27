#pragma once

#define FACE_SOCKET "/run/erhai-face/auth.sock"
#define FACE_RECOGNIZING (-20)
#define FACE_USER_SIZE 64

struct face_request {
    char user[FACE_USER_SIZE];
    char service[32];
};
