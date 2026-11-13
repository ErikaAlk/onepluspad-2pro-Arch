# SPDX-License-Identifier: MIT
import argparse
import hashlib
import json
from pathlib import Path
from elftools.elf.elffile import ELFFile
import shutil


def build(root, out, layout):
    root = root.resolve()
    if out.exists():
        raise ValueError('output must be a new directory')
    libraries = root / ('usr/lib' if layout == 'arch' else 'usr/lib/aarch64-linux-gnu')
    pending = [('usr/sbin/e2fsck', root / ('usr/bin/e2fsck' if layout == 'arch' else 'usr/sbin/e2fsck'))]
    files = {}
    while pending:
        relative, source = pending.pop()
        if relative in files:
            continue
        # 所有符号链接均在目标发行版根目录内解析。
        for _ in range(32):
            if not source.is_symlink():
                break
            target = source.readlink()
            source = root / str(target).lstrip('/') if target.is_absolute() else source.parent / target
        source = source.resolve()
        if not source.is_relative_to(root):
            raise ValueError('input escapes distribution root: ' + relative)
        with source.open('rb') as stream:
            elf = ELFFile(stream)
            if elf.header['e_machine'] != 'EM_AARCH64':
                raise ValueError('expected ARM64 ELF: ' + relative)
            dynamic = elf.get_section_by_name('.dynamic')
            if dynamic is not None:
                for tag in dynamic.iter_tags('DT_NEEDED'):
                    prefix = 'usr/lib/' if layout == 'arch' else 'lib/aarch64-linux-gnu/'
                    pending.append((prefix + tag.needed, libraries / tag.needed))
            for segment in elf.iter_segments('PT_INTERP'):
                interpreter = segment.get_interp_name()
                expected_interpreters = ('/usr/lib/ld-linux-aarch64.so.1', '/lib/ld-linux-aarch64.so.1') if layout == 'arch' else ('/lib/ld-linux-aarch64.so.1',)
                if interpreter not in expected_interpreters:
                    raise ValueError('unexpected ELF interpreter: ' + interpreter)
                pending.append((interpreter.lstrip('/'), libraries / Path(interpreter).name))
        files[relative] = source
    # 保留目标发行版已经提供的 e2fsck 配置。
    config = root / 'etc/e2fsck.conf'
    if config.exists():
        files['etc/e2fsck.conf'] = config
    out.mkdir(parents=True)
    manifest = {}
    for relative, source in sorted(files.items()):
        destination = out / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        destination.chmod(0o644 if relative.startswith('etc/') else 0o755)
        manifest[relative] = hashlib.sha256(destination.read_bytes()).hexdigest()
    (out / 'root-fsck-files.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description='收集发行版 e2fsck 和完整 ARM64 动态库依赖')
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--layout', choices=('ubuntu', 'arch'), default='ubuntu')
    args = parser.parse_args()
    build(args.root, args.out, args.layout)


if __name__ == '__main__':
    main()
