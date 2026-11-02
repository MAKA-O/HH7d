/**
 * Обход ограничения песочницы Windows: запрещён запуск дочерних процессов
 * с pipe-каналами (spawn/exec с перехватом вывода падает с EPERM).
 *
 * Vite на Windows при первом вызове realpath определяет сетевые диски через
 * `exec("net use")`. В песочнице это бросает EPERM и роняет сборку.
 * Патч подменяет только этот конкретный вызов: сообщаем «сетевых дисков нет»
 * без запуска процесса. На обычной машине (без песочницы) результат тот же.
 *
 * Подключается через `node --require ./scripts/sandbox-spawn-workaround.cjs`.
 */
'use strict'

const childProcess = require('node:child_process')

const originalExec = childProcess.exec
const originalExecFile = childProcess.execFile

/** Минимальная заглушка ChildProcess — Vite не использует её поля. */
function fakeChildProcess() {
  return {
    pid: -1,
    exitCode: null,
    spawnargs: [],
    stdout: null,
    stderr: null,
    stdin: null,
    on() {
      return this
    },
    once() {
      return this
    },
    removeListener() {
      return this
    },
    kill() {
      return false
    },
    unref() {
      return this
    },
  }
}

function isNetUse(command) {
  return typeof command === 'string' && command.trim().toLowerCase() === 'net use'
}

childProcess.exec = function patchedExec(command, options, callback) {
  if (isNetUse(command)) {
    const done = typeof options === 'function' ? options : callback
    if (typeof done === 'function') process.nextTick(() => done(null, '', ''))
    return fakeChildProcess()
  }
  return originalExec.apply(this, arguments)
}

childProcess.execFile = function patchedExecFile(file, args, options, callback) {
  if (isNetUse(file)) {
    const done = typeof options === 'function' ? options : callback
    if (typeof done === 'function') process.nextTick(() => done(null, '', ''))
    return fakeChildProcess()
  }
  return originalExecFile.apply(this, arguments)
}

// На не-Windows Vite этот путь не использует — патч просто не срабатывает.
module.exports = {}
