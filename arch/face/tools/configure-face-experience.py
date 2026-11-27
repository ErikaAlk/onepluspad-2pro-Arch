import argparse
import configparser
import os
from pathlib import Path
import tempfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    options = parser.parse_args()
    config = configparser.ConfigParser(interpolation=None)
    with options.config.open(encoding='utf-8') as source:
        config.read_file(source)
    enabled_before = config.getboolean('core', 'disabled')
    if config.get('core', 'workaround') != 'off':
        raise SystemExit('当前面容并发设置与已验证配置不同，停止修改。')
    config.set('core', 'detection_notice', 'true')
    with tempfile.NamedTemporaryFile(
        mode='w', encoding='utf-8', dir=options.config.parent,
        prefix=options.config.name + '.', suffix='.pending', delete=False,
    ) as destination:
        pending = Path(destination.name)
        config.write(destination)
        destination.flush()
        os.fsync(destination.fileno())
    os.replace(pending, options.config)
    print(f'识别状态通知已开启；disabled={str(enabled_before).lower()}')


if __name__ == '__main__':
    main()
