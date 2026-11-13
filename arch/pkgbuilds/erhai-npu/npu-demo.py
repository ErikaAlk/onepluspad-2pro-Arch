import argparse
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description='使用 Hexagon NPU 与 CPU 执行本地 Qwen 推理')
parser.add_argument('--backend', choices=('hybrid', 'npu', 'cpu'), default='hybrid', help='明确选择混合、NPU 或 CPU 后端')
parser.add_argument('--model', type=Path, default=Path('/usr/share/qcom-npu/Qwen3-0.6B-Q4_0.gguf'))
parser.add_argument('--prompt', default='请用中文介绍你自己。')
parser.add_argument('--prompt-file', type=Path)
parser.add_argument('--tokens', type=int, default=64)
parser.add_argument('--diagnostics', action='store_true')
parser.add_argument('--check', action='store_true')
arguments = parser.parse_args()
if not 1 <= arguments.tokens <= 512:
    parser.error('生成数量必须为 1 至 512')
library = Path('/usr/lib/aarch64-linux-gnu/qcom-npu')
if not arguments.model.is_file():
    parser.error('模型文件不存在')
if arguments.backend != 'cpu':
    for node in ('/dev/fastrpc-cdsp', '/dev/dma_heap/system'):
        if not os.access(node, os.R_OK | os.W_OK):
            parser.error('无法读写设备：' + node)
    for file in (Path('/usr/share/qcom/npu-dsp/fastrpc_shell_unsigned_3'), library / 'libggml-htp-v79.so'):
        if not file.is_file():
            parser.error('缺少运行文件：' + str(file))
if arguments.check:
    print('前置文件及访问权限检查通过，实际推理仍须执行。')
else:
    prompt = arguments.prompt_file.read_text() if arguments.prompt_file else '<|im_start|>user\n' + arguments.prompt + '<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n'
    environment = dict(os.environ, GGML_HEXAGON_POWER_MODE='balanced')
    if arguments.diagnostics:
        environment['NPU_DEMO_DIAGNOSTICS'] = '1'
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', prefix='erhai-npu-', dir=os.environ['XDG_RUNTIME_DIR']) as source:
        source.write(prompt)
        source.flush()
        subprocess.run([str(library / 'npu-hybrid'), str(arguments.model), source.name, arguments.backend, str(arguments.tokens), str(library)], env=environment, check=True)
