#!/bin/bash
set -euo pipefail
project=$(cd -- "$(dirname -- "$0")/.." && pwd)
output=${1:?请指定构建输出目录}
mkdir -p "$output"
cc -std=c17 -O2 -Wall -Wextra -Werror -Wl,-z,relro,-z,now \
    "$project/auth/face-broker.c" -o "$output/broker" $(pkg-config --cflags --libs libsystemd pam)
cc -std=c17 -O2 -Wall -Wextra -Werror -fPIC -shared -Wl,-z,relro,-z,now \
    "$project/auth/pam-erhai-face.c" -o "$output/pam_erhai_face.so" $(pkg-config --cflags --libs pam)
