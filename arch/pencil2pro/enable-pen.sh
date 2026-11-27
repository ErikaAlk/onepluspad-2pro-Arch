#!/bin/sh
set -eu

device=/sys/bus/spi/devices/spi0.0
drivers=/sys/bus/spi/drivers
test "$(tr -d '\000' < "$device/of_node/compatible")" = novatek,nt36536-ts
modprobe nt36536_pen
case "$(basename "$(readlink "$device/driver")")" in
    nt36536)
        printf '%s' spi0.0 > "$drivers/nt36536/unbind"
        if ! printf '%s' spi0.0 > "$drivers/nt36536-pen/bind"; then
            printf '%s' spi0.0 > "$drivers/nt36536/bind"
            exit 1
        fi
        ;;
    nt36536-pen) ;;
    *) exit 1 ;;
esac
printf '%s' 2 > "$device/pen_protocol"
