"""将客户算法模块编译为可直接执行和导入的 sourceless pyc。"""

from pathlib import Path
import py_compile
import sys


def compile_modules(source_root: Path, target_root: Path, names: list[str]) -> None:
    """将指定源码编译到目标目录，产物使用稳定的虚拟调试路径。"""
    for name in names:
        source = source_root / name
        target = target_root / f"{source.stem}.pyc"
        py_compile.compile(
            str(source),
            cfile=str(target),
            dfile=f"<jqtools-algorithm>/{name}",
            doraise=True,
            optimize=2,
        )


def main() -> None:
    """解析构建参数并编译全部第一方算法模块。"""
    if len(sys.argv) < 4:
        raise ValueError(
            "用法: compile-python-bytecode.py <source_root> <target_root> <module...>"
        )

    compile_modules(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:])


if __name__ == "__main__":
    main()
