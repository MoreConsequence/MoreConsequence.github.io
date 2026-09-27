#!/usr/bin/env python3
"""Upgrade diagram font stacks to cross-platform native fonts (Windows + Mac).

Eliminates external Google Fonts (Geist, Instrument Serif) that are blocked in SVG
image tags and fall back to Times New Roman / SimSun on Windows. Replaces them with
crisp native system font stacks: Segoe UI, Cascadia Code, Microsoft YaHei, SF, PingFang.
"""
import glob
import os
import re
import sys

SANS_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif"
MONO_STACK = "ui-monospace, 'Cascadia Code', 'Segoe UI Mono', Menlo, Consolas, monospace"

def upgrade_content(txt: str) -> tuple[str, int]:
    count = 0

    # 1. Attribute-style font-family="..."
    # Instrument Serif variants -> SANS_STACK
    new_txt, n1 = re.subn(r'font-family="[^"]*?Instrument Serif[^"]*?"', f'font-family="{SANS_STACK}"', txt)
    count += n1

    # Geist Mono variants -> MONO_STACK (must run before Geist sans)
    new_txt, n2 = re.subn(r'font-family="[^"]*?Geist Mono[^"]*?"', f'font-family="{MONO_STACK}"', new_txt)
    count += n2

    # Geist sans variants -> SANS_STACK
    new_txt, n3 = re.subn(r'font-family="[^"]*?Geist[^"]*?"', f'font-family="{SANS_STACK}"', new_txt)
    count += n3

    # 2. CSS-style font-family: ...;
    new_txt, n4 = re.subn(r'font-family:\s*[^;]*?Instrument Serif[^;]*?;', f'font-family: {SANS_STACK};', new_txt)
    count += n4

    new_txt, n5 = re.subn(r'font-family:\s*[^;]*?Geist Mono[^;]*?;', f'font-family: {MONO_STACK};', new_txt)
    count += n5

    new_txt, n6 = re.subn(r'font-family:\s*[^;]*?Geist[^;]*?;', f'font-family: {SANS_STACK};', new_txt)
    count += n6

    # 3. Strip Google font link tags and @import rules
    new_txt, n7 = re.subn(r'\s*<link href="https://fonts\.googleapis\.com/[^"]*?" rel="stylesheet">', '', new_txt)
    count += n7

    new_txt, n8 = re.subn(r'<style>\s*@import url\(\x27https://fonts\.googleapis\.com/[^\x27]*?\x27\);\s*</style>', '', new_txt)
    count += n8

    return new_txt, count

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    targets = []
    targets.extend(glob.glob(os.path.join(root, 'public/images/*.svg')))
    targets.extend(glob.glob(os.path.join(root, 'diagrams/*/*.html')))
    targets.extend(glob.glob(os.path.join(root, 'evidence/*/*.html')))

    modified_files = 0
    total_replacements = 0

    for path in sorted(targets):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            upgraded, n = upgrade_content(content)
            if n > 0 and upgraded != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(upgraded)
                modified_files += 1
                total_replacements += n
        except Exception as e:
            print(f"Error processing {path}: {e}", file=sys.stderr)

    print(f"Completed font stack upgrade:")
    print(f"  Modified files: {modified_files}")
    print(f"  Total font replacements: {total_replacements}")

if __name__ == '__main__':
    main()
