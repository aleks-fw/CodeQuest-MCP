import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findVenvPython, normalizeName, readPythonProject } from '../../src/analyzer/python-project.js';
import { byPath, sourceFiles } from '../helpers/source-files.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

function read(files: Record<string, string>, venv: string | null = null) {
  return readPythonProject(byPath(sourceFiles(files)), venv);
}

describe('readPythonProject', () => {
  it('reads requirements files, ignoring comments, options and URLs', () => {
    const project = read({
      'main.py': 'print(1)\n',
      'requirements.txt': [
        '# core',
        'aiogram==3.4.1  # bot',
        '-r base.txt',
        'git+https://github.com/x/y.git#egg=y',
        'Python_Telegram_Bot>=20',
        'requests[socks]>=2',
        '',
      ].join('\n'),
      'requirements-dev.txt': 'pytest\n',
    });
    expect(project.dependencies).toEqual(['aiogram', 'pytest', 'python-telegram-bot', 'requests']);
    expect(project.frameworks).toEqual(['aiogram', 'python-telegram-bot']);
    expect(project.hasPytest).toBe(true);
  });

  it('reads project, optional, dependency-groups and poetry dependencies from pyproject.toml', () => {
    const project = read({
      'app.py': 'x = 1\n',
      'pyproject.toml': [
        '[project]',
        'name = "demo"',
        'dependencies = ["FastAPI>=0.100", "uvicorn[standard]"]',
        '[project.optional-dependencies]',
        'web = ["flask"]',
        '[dependency-groups]',
        'dev = ["pytest>=8", { include-group = "lint" }]',
        '[tool.poetry.dependencies]',
        'python = "^3.12"',
        'django = "^5"',
        '[tool.poetry.group.dev.dependencies]',
        'ruff = "*"',
        '[tool.ruff]',
        'line-length = 100',
      ].join('\n'),
    });
    expect(project.dependencies).toEqual(['django', 'fastapi', 'flask', 'pytest', 'ruff', 'uvicorn']);
    expect(project.frameworks).toEqual(['django', 'fastapi', 'flask']);
    expect(project.hasPytest).toBe(true);
    expect(project.hasRuff).toBe(true);
    expect(project.commands).toEqual({ test: 'python -m pytest -q', lint: 'python -m ruff check .' });
  });

  it('detects pytest by pytest.ini, conftest.py or [tool.pytest.ini_options] without a dependency', () => {
    expect(read({ 'a.py': '1\n', 'pytest.ini': '[pytest]\n' }).hasPytest).toBe(true);
    expect(read({ 'a.py': '1\n', 'tests/conftest.py': '\n' }).hasPytest).toBe(true);
    expect(read({ 'a.py': '1\n', 'pyproject.toml': '[tool.pytest.ini_options]\naddopts = "-q"\n' }).hasPytest).toBe(
      true,
    );
    expect(read({ 'a.py': '1\n' }).hasPytest).toBe(false);
  });

  it('detects ruff by ruff.toml and .ruff.toml, and uses the venv interpreter for commands', () => {
    const project = read({ 'a.py': '1\n', '.ruff.toml': 'line-length = 88\n', 'pytest.ini': '' }, '.venv/bin/python');
    expect(project.interpreter).toBe('.venv/bin/python');
    expect(project.commands).toEqual({
      test: '.venv/bin/python -m pytest -q',
      lint: '.venv/bin/python -m ruff check .',
    });
  });

  it('gives empty facts for broken TOML and adds no commands to a project without Python', () => {
    const broken = read({ 'a.py': '1\n', 'pyproject.toml': '[project\nname =' });
    expect(broken.dependencies).toEqual([]);
    expect(broken.commands).toEqual({});
    expect(read({ 'index.js': '1\n', 'ruff.toml': '', 'conftest.py-not': '' }).commands).toEqual({});
  });

  it('normalises names like pip does', () => {
    expect(normalizeName('Python_Telegram.Bot')).toBe('python-telegram-bot');
  });
});

describe('findVenvPython', () => {
  it('finds .venv/bin/python and returns null without a virtualenv', async () => {
    const empty = await makeTempDir();
    expect(await findVenvPython(empty)).toBeNull();
    const root = await makeTempDir();
    await mkdir(path.join(root, '.venv', 'bin'), { recursive: true });
    await writeFile(path.join(root, '.venv', 'bin', 'python'), '');
    expect(await findVenvPython(root)).toBe('.venv/bin/python');
  });
});
