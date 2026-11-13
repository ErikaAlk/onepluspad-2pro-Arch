import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request

parser = argparse.ArgumentParser(description='构建Arch和Android的AArch64 Mesa及Iris')
parser.add_argument('--repo', type=Path, required=True)
parser.add_argument('--sysroot', type=Path, required=True)
parser.add_argument('--cache', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--ndk', type=Path)
parser.add_argument('--android-deps', type=Path)
parser.add_argument('--jobs', type=int, default=2)
parser.add_argument('--android', action='store_true')
options = parser.parse_args()
if options.android and (options.ndk is None or options.android_deps is None):
    parser.error('--android需要--ndk与--android-deps')
repo = options.repo.resolve(strict=True)
root = options.sysroot.resolve(strict=True)
cache = options.cache.resolve()
output = options.output.resolve()
entry = Path(__file__).resolve().parent
cache.mkdir(parents=True, exist_ok=True)
output.mkdir(parents=True, exist_ok=True)
(output / 'temp').mkdir(exist_ok=True)
(output / 'src').mkdir(exist_ok=True)
environment = os.environ.copy()
environment['TMPDIR'] = str(output / 'temp')
environment['QEMU_LD_PREFIX'] = str(root)
environment['PKG_CONFIG_SYSROOT_DIR'] = str(root)
environment['PKG_CONFIG_LIBDIR'] = os.pathsep.join(str(root / item) for item in ['usr/lib/pkgconfig', 'usr/share/pkgconfig'])

def run(arguments, cwd=None, env=environment):
    subprocess.run([str(item) for item in arguments], cwd=cwd, env=env, check=True)

def archive(url, filename, expected):
    path = cache / filename
    if not path.exists():
        urllib.request.urlretrieve(url, path)
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f'源代码校验失败: {path}')
    return path

def patch(source, path, expected=None):
    if expected and hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f'补丁校验失败: {path}')
    run(['patch', '--batch', '--fuzz=0', '-p1', '-i', path], cwd=source)

def build(name, source, flags, cross, env=environment):
    build_dir = output / f'{name}-build'
    run(['meson', 'setup', build_dir, source, '--cross-file', cross, '--buildtype=release', '--wrap-mode=nodownload', *flags], env=env)
    run(['meson', 'compile', '-C', build_dir, f'-j{options.jobs}'], env=env)
    install_env = env.copy()
    install_env['DESTDIR'] = str(output / f'{name}-install')
    run(['meson', 'install', '-C', build_dir, '--no-rebuild'], env=install_env)

mesa_meta = repo / 'packaging/mesa/shared/mesa'
mesa = json.loads((mesa_meta / 'source.json').read_text())
mesa_source = output / 'src' / f'mesa-{mesa["version"]}'
if mesa_source.exists():
    raise FileExistsError(f'请使用全新输出目录: {mesa_source}')
mesa_archive = archive(mesa['archive_url'], mesa['archive'], mesa['archive_sha256'])
run(['tar', '-xf', mesa_archive, '-C', output / 'src'])
patch(mesa_source, mesa_meta / Path(mesa['patch']).name, mesa['patch_sha256'])
for item in mesa['additional_patches']:
    patch(mesa_source, mesa_meta / Path(item['path']).name, item['sha256'])
patch(mesa_source, entry / 'mesa-android-hal-name.patch')
compile_args = [f'--sysroot={root}', '-isystem', str(root / 'usr/include')]
link_args = [f'--sysroot={root}', f'-L{root / "usr/lib"}', f'-Wl,-rpath-link,{root / "usr/lib"}']
host_flags = ['--prefix=/usr', '--libdir=lib', '-Dc_args=' + json.dumps(compile_args), '-Dcpp_args=' + json.dumps(compile_args), '-Dc_link_args=' + json.dumps(link_args), '-Dcpp_link_args=' + json.dumps(link_args)]
build('host', mesa_source, host_flags + ['-Dauto_features=disabled', '-Dplatforms=x11,wayland', '-Dgallium-drivers=freedreno', '-Dfreedreno-kmds=msm', '-Dvulkan-drivers=freedreno', '-Degl=enabled', '-Dgles1=disabled', '-Dgles2=enabled', '-Dopengl=true', '-Dgbm=enabled', '-Dglx=dri', '-Dglvnd=enabled', '-Dllvm=disabled', '-Dshared-glapi=enabled', '-Dbuild-tests=false', '-Dvideo-codecs=all', '-Dvulkan-layers=device-select', '-Dzstd=enabled'], entry / 'aarch64.cross')
iris_meta = repo / 'packaging/iris-vaapi'
iris = json.loads((iris_meta / 'source.json').read_text())
iris_archive = archive(iris['archive_url'], f'iris-{iris["commit"]}.tar.gz', iris['archive_sha256'])
run(['tar', '-xf', iris_archive, '-C', output / 'src'])
iris_source = output / 'src' / f'qualcomm-iris-vaapi-{iris["commit"]}'
for name in iris['patches']:
    patch(iris_source, iris_meta / name)
build('iris', iris_source, host_flags, entry / 'aarch64.cross')
run(['meson', 'test', '-C', output / 'iris-build', '--print-errorlogs', 'hevc-parameter-sets', 'encode-params'])

if options.android:
    ndk = options.ndk.resolve(strict=True)
    deps = options.android_deps.resolve(strict=True)
    android_env = environment.copy()
    android_env['PATH'] = str(ndk / 'toolchains/llvm/prebuilt/linux-x86_64/bin') + os.pathsep + environment['PATH']
    android_env['PKG_CONFIG_SYSROOT_DIR'] = ''
    android_env['PKG_CONFIG_LIBDIR'] = str(deps / 'lib64/pkgconfig')
    includes = [f'-I{deps / "include" / name}' for name in ['libhardware', 'libcutils', 'libsystem', 'libsync', 'liblog', 'nativewindow', 'nativewindow-private', 'nativebase', 'hwvulkan']]
    android_links = [f'-L{deps / "lib64"}', f'-Wl,-rpath-link,{deps / "lib64"}']
    android_flags = ['--prefix=/vendor', '--libdir=lib64', '-Dc_args=' + json.dumps(includes), '-Dcpp_args=' + json.dumps(includes + ['-fno-exceptions', '-fno-unwind-tables', '-fno-asynchronous-unwind-tables']), '-Dc_link_args=' + json.dumps(android_links), '-Dcpp_link_args=' + json.dumps(android_links + ['-static-libstdc++'])]
    build('android', mesa_source, android_flags + ['-Dauto_features=disabled', '-Dplatforms=android', '-Dplatform-sdk-version=33', '-Dandroid-stub=false', '-Dandroid-libbacktrace=disabled', '-Dandroid-strict=false', '-Dgallium-drivers=freedreno', '-Dfreedreno-kmds=msm', '-Dvulkan-drivers=freedreno', '-Degl=enabled', '-Dgles1=enabled', '-Dgles2=enabled', '-Dopengl=true', '-Dgbm=enabled', '-Dgbm-backends-path=/vendor/lib64', '-Dglx=disabled', '-Dllvm=disabled', '-Dexpat=disabled', '-Dxmlconfig=disabled', '-Dzstd=disabled', '-Dcpp_rtti=false', '-Degl-lib-suffix=_mesa', '-Dgles-lib-suffix=_mesa', '-Dzlib=enabled', '-Dbuild-tests=false'], entry / 'android33.cross', android_env)
