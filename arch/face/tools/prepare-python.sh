#!/bin/bash
set -euo pipefail
test "$(id -u)" = 0
test "$(uname -m)" = aarch64
pacman -S --needed python-opencv libinih libevdev python-pip python-setuptools python-wheel python-build python-gobject python-cairo python-pam cmake meson ninja clang gettext pkgconf
install -d -m755 /opt/erhai-howdy
python -m venv --system-site-packages /opt/erhai-howdy/venv
install -d -m700 /var/cache/erhai/howdy-build
export TMPDIR=/var/cache/erhai/howdy-build CMAKE_BUILD_PARALLEL_LEVEL=4 CC=clang CXX=clang++
/opt/erhai-howdy/venv/bin/python -m pip install --no-build-isolation dlib==20.0.1
