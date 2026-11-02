"""Workaround for the bundled CPython build on Windows.

This Python build applies the POSIX ``mode`` argument to the NTFS ACL, so
``os.mkdir(path, 0o700)`` creates a directory that the creating process can no
longer access (pip/npm fail on their temporary directories).

We relax the mode for newly created files and directories. Permissions are
already confined by the sandbox / user profile, so this is safe for local dev.
"""
import os

_REAL_MKDIR = os.mkdir
_REAL_OPEN = os.open


def _mkdir(path, mode=0o777, *, dir_fd=None):
    return _REAL_MKDIR(path, 0o777, dir_fd=dir_fd)


def _open(path, flags, mode=0o777, *, dir_fd=None):
    if flags & os.O_CREAT:
        mode = 0o666
    return _REAL_OPEN(path, flags, mode, dir_fd=dir_fd)


os.mkdir = _mkdir
os.open = _open
