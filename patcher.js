const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { c, tag } = require('./colors');

function readErrorMessage(logFile = 'app.log') {
  try {
    const log = fs.readFileSync(logFile, 'utf-8');
    const lines = log.trim().split('\n').reverse();
    const errorLine = lines.find(
      (line) =>
        line.startsWith('TypeError') ||
        line.startsWith('Error') ||
        line.match(/^\w+Error:/),
    );
    return errorLine || null;
  } catch (err) {
    console.error('Failed to read log file:', err.message);
    return null;
  }
}

async function readLastError(logFile = 'app.log') {
  try {
    const log = fs.readFileSync(logFile, 'utf-8');
    const lines = log.trim().split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Error')) {
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s+at\s/.test(lines[j])) {
            return lines[j];
          }
        }
      }
    }

    return null;
  } catch (err) {
    console.error('Failed to read app.log:', err.message);
    return null;
  }
}

function parseErrorDetails(errorLine) {
  const match = errorLine?.match(/at\s+(?:.*\s)?([^\s()]+):(\d+):\d+/);
  if (!match) return null;
  return {
    filePath: match[1],
    lineNumber: parseInt(match[2], 10),
  };
}

function extractFunctionCode(lines, errorLine) {
  const start = findFunctionStart(lines, errorLine);
  const end = findFunctionEnd(lines, start);
  return {
    funcCode: lines.slice(start, end + 1).join('\n'),
    startLine: start,
    endLine: end,
  };
}

function findFunctionStart(lines, index) {
  for (let i = index; i >= 0; i--) {
    const line = lines[i].trim();

    if (
      /function\s*\w*\s*\(/.test(line) ||
      /=\s*\(?.*\)?\s*=>\s*\{/.test(line) ||
      /\w+\.\w+\(.*,\s*\(?.*\)?\s*=>\s*\{/.test(line)
    ) {
      return i;
    }
  }
  return 0;
}

function findFunctionEnd(lines, start) {
  let depth = 0;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    depth += (line.match(/{/g) || []).length;
    depth -= (line.match(/}/g) || []).length;

    if (depth === 0) {
      return i;
    }
  }

  return lines.length - 1;
}

async function getFunctionFix(errorMessage, funcCode) {
  const res = await fetch(process.env.OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior developer. Fix the function so /parse never throws if req.body.data is not a string. Coerce data to a string safely and return 200 with { result }. Return ONLY the full fixed function in a single JavaScript code block.',
        },
        {
          role: 'user',
          content: `Error: ${errorMessage}\n\nFunction:\n${funcCode}`,
        },
      ],
    }),
  });

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || null;
}

function replaceFunctionInFile(
  filePath,
  originalLines,
  startLine,
  endLine,
  newFunctionCode,
) {
  const newLines = [
    ...originalLines.slice(0, startLine),
    ...newFunctionCode.split('\n'),
    ...originalLines.slice(endLine + 1),
  ];
  fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
  console.log(
    `${tag('patcher', c.magenta)} ${c.green('Patched')} ${c.bold(path.basename(filePath))} ${c.dim('(function replaced)')}`,
  );
}

function extractFirstCodeBlock(responseText) {
  const match = responseText.match(/```(?:javascript)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

async function runSurgicalPatch() {
  const errorLine = await readLastError();
  const errorMessage = await readErrorMessage();
  if (!errorLine) {
    console.log(`${tag('patcher', c.magenta)} ${c.gray('No error found.')}`);
    return false;
  }

  const details = parseErrorDetails(errorLine);
  if (!details) {
    console.log(
      `${tag('patcher', c.magenta)} ${c.red('Could not parse error file/line info.')}`,
    );

    return false;
  }

  const { filePath, lineNumber } = details;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

  const { funcCode, startLine, endLine } = extractFunctionCode(
    lines,
    lineNumber,
  );

  const response = await getFunctionFix(errorMessage, funcCode);
  const fixedFunction = extractFirstCodeBlock(response || '');

  if (!fixedFunction || !fixedFunction.includes('{')) {
    console.log('No valid patch returned.');
    return false;
  }

  if (!isPatchSafe(fixedFunction)) {
    console.log('Patch rejected by safety gate.');
    return false;
  }

  printPatchPreview({
    filePath,
    startLine,
    endLine,
    beforeCode: funcCode,
    afterCode: fixedFunction || '',
  });
  printMiniDiff(funcCode, fixedFunction);

  writeBackup(filePath);
  replaceFunctionInFile(filePath, lines, startLine, endLine, fixedFunction);
  return true;
}

function printMiniDiff(beforeCode, afterCode, maxLines = 60) {
  const a = beforeCode.split('\n');
  const b = afterCode.split('\n');
  const n = Math.min(Math.max(a.length, b.length), maxLines);

  console.log(c.blue('---------------- MINI DIFF ----------------'));
  for (let i = 0; i < n; i++) {
    const aa = a[i] ?? '';
    const bb = b[i] ?? '';
    if (aa === bb) continue;

    if (aa) console.log(`${c.red('-')} ${c.red(aa)}`);
    if (bb) console.log(`${c.green('+')} ${c.green(bb)}`);
  }
  if (Math.max(a.length, b.length) > maxLines)
    console.log(c.yellow('... (diff truncated)'));
  console.log(c.blue('---------------------------------------------------'));
}

function isPatchSafe(code) {
  const banned = [
    'child_process',
    'fs.',
    'require("fs")',
    "require('fs')",
    'exec(',
    'spawn(',
    'fork(',
    'process.env',
    'http://',
    'https://',
    'fetch(',
  ];
  return !banned.some((x) => code.includes(x));
}

function writeBackup(filePath) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.bak.${ts}`;
  fs.copyFileSync(filePath, backupPath);
  console.log(`[patcher] Backup created: ${backupPath}`);
}

function preview(code, maxLines = 25) {
  const lines = code.split('\n');
  const out = lines.slice(0, maxLines).join('\n');
  return lines.length > maxLines ? out + '\n...' : out;
}

function printPatchPreview({
  filePath,
  startLine,
  endLine,
  beforeCode,
  afterCode,
}) {
  console.log(
    c.bold(c.blue('\n================ PATCH PREVIEW ================\n')),
  );

  console.log(`File: ${c.bold(filePath)}`);
  console.log(`Range: ${c.yellow(`lines ${startLine + 1} to ${endLine + 1}`)}`);
  console.log(c.blue('-------------- BEFORE --------------'));
  console.log(c.gray(preview(beforeCode)));
  console.log(c.green('-------------- AFTER  --------------'));
  console.log(preview(afterCode));
  console.log(c.blue('==============================================\n'));
}

module.exports = {
  runSurgicalPatch,
};
