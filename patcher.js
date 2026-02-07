const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

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
  console.log(`Function in ${path.basename(filePath)} successfully patched.`);
}

function extractFirstCodeBlock(responseText) {
  const match = responseText.match(/```(?:javascript)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

async function runSurgicalPatch() {
  const errorLine = await readLastError();
  const errorMessage = await readErrorMessage();
  if (!errorLine) {
    console.log('No error found.');
    return false;
  }

  const details = parseErrorDetails(errorLine);
  if (!details) {
    console.log('Could not parse error file/line info.');
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

  replaceFunctionInFile(filePath, lines, startLine, endLine, fixedFunction);
  return true;
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

module.exports = {
  runSurgicalPatch,
};
