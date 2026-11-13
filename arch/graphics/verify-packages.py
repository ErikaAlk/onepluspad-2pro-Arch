import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

parser = argparse.ArgumentParser(description='核验图形包架构、归属、内容和libglvnd冲突')
parser.add_argument('--packages', type=Path, required=True)
parser.add_argument('--sysroot', type=Path, required=True)
parser.add_argument('--stage', type=Path, required=True)
options = parser.parse_args()
root = options.sysroot.resolve()
glvnd = set(subprocess.check_output(['pacman', '--root', str(root), '-Qlq', 'libglvnd'], text=True).splitlines())
glvnd_files = {str(Path(path).relative_to(root)) for path in glvnd if not path.endswith('/')}
ownership = {}
report = []
for package in sorted(options.packages.rglob('*.pkg.tar.zst')):
    with tarfile.open(package, 'r:zst') as archive:
        info = archive.extractfile('.PKGINFO').read().decode()
        assert '\narch = aarch64\n' in info, package
        members = [item for item in archive.getmembers() if item.name.startswith('usr/') and not item.isdir()]
        for item in members:
            assert item.name not in glvnd_files, f'libglvnd文件冲突: {item.name}'
            assert item.name not in ownership, f'包文件归属重复: {item.name}'
            ownership[item.name] = package.name
            if '.so' in Path(item.name).name and item.isfile():
                install = 'iris-install' if package.name.startswith('libva-iris') else 'host-install'
                expected = options.stage / install / item.name
                assert archive.extractfile(item).read() == expected.read_bytes(), item.name
        report.append({'package': str(package.resolve()), 'sha256': hashlib.sha256(package.read_bytes()).hexdigest(), 'metadata': info, 'files': [item.name for item in members]})
assert 'usr/lib/gbm/dri_gbm.so' in ownership
assert 'usr/lib/dri/msm_dri.so' in ownership
assert 'usr/lib/dri/msm_drv_video.so' in ownership
assert ownership['usr/lib/libvulkan_freedreno.so'].startswith('vulkan-freedreno-')
assert ownership['usr/lib/libVkLayer_MESA_device_select.so'].startswith('vulkan-mesa-implicit-layers-')
(options.packages / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print('四个AArch64软件包通过：文件归属互斥、libglvnd无冲突、GBM后端及MSM入口存在、动态库内容与已验证stage一致')
