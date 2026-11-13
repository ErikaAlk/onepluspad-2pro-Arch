import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description='准备和构建固定版本的 Arch 定制内核')
parser.add_argument('action', choices=('prepare', 'build'))
parser.add_argument('kernel', type=Path)
parser.add_argument('output', type=Path, nargs='?')
parser.add_argument('--jobs', type=int, default=8)
arguments = parser.parse_args()
repository = Path(__file__).resolve().parents[2]
lock = json.loads((repository / 'arch/source.json').read_text())['kernel']
kernel = arguments.kernel.resolve()

def run(command, **keywords):
    return subprocess.run([str(value) for value in command], check=True, **keywords)

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

bundle = repository / 'arch' / lock['bundle']
configuration = repository / 'arch' / lock['config']
assert digest(bundle) == lock['bundle_sha256'], '内核提交归档校验失败'
assert digest(configuration) == lock['config_sha256'], '内核配置校验失败'
if arguments.action == 'prepare':
    assert not kernel.exists(), '源码目标目录已经存在'
    run(['git', 'clone', '--filter=blob:none', '--single-branch', '--branch', lock['baseline_tag'], lock['repository'], kernel])
    assert subprocess.check_output(['git', '-C', kernel, 'rev-parse', 'HEAD'], text=True).strip() == lock['baseline_commit']
    run(['git', '-C', kernel, 'bundle', 'verify', bundle])
    run(['git', '-C', kernel, 'fetch', bundle, lock['bundle_ref'] + ':refs/heads/arch/v0.9.1'])
    run(['git', '-C', kernel, 'switch', 'arch/v0.9.1'])
else:
    assert arguments.output is not None and arguments.jobs > 0
    assert subprocess.check_output(['git', '-C', kernel, 'rev-parse', 'HEAD'], text=True).strip() == lock['custom_commit']
    assert not subprocess.check_output(['git', '-C', kernel, 'status', '--porcelain', '--untracked-files=no'], text=True).strip()
    output = arguments.output.resolve()
    (output / 'build-temp').mkdir(parents=True, exist_ok=True)
    environment = dict(os.environ, TMPDIR=str(output / 'build-temp'), ARCH='arm64', CROSS_COMPILE='aarch64-linux-gnu-', KBUILD_BUILD_USER='ErikaAlk', KBUILD_BUILD_HOST='onepluspad-2pro-Arch')
    run(['python', repository / 'tools/kernel-rust-identity.py'], env=environment)
    shutil.copyfile(configuration, output / '.config')
    command = ['make', '-C', kernel, 'O=' + str(output), 'ARCH=arm64', 'CROSS_COMPILE=aarch64-linux-gnu-']
    command += ['RUSTC=' + environment['RUSTC'], 'HOSTRUSTC=' + environment['RUSTC'], 'BINDGEN=' + environment['BINDGEN']]
    run([*command, 'rustavailable'], env=environment)
    run([*command, 'olddefconfig'], env=environment)
    final_configuration = (output / '.config').read_text().splitlines()
    assert 'CONFIG_RUST=y' in final_configuration, 'Rust 未启用'
    assert 'CONFIG_ANDROID_BINDER_IPC_RUST=y' in final_configuration, 'Rust Binder 未启用'
    run([*command, 'CC=ccache aarch64-linux-gnu-gcc', '-j' + str(arguments.jobs), 'Image', 'modules', 'qcom/sm8750-erhai.dtb'], env=environment)
    run([*command, 'INSTALL_MOD_PATH=' + str(output / 'stage'), 'modules_install'], env=environment)
    (output / 'kernel-commit.txt').write_text(lock['custom_commit'] + '\n')
    print('内核、设备树和模块构建通过。')
