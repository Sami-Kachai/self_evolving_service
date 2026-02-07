const supportsColor =
  process.stdout.isTTY &&
  process.env.NO_COLOR !== '1' &&
  process.env.TERM !== 'dumb';

function wrap(code) {
  return (s) => (supportsColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
}

const c = {
  dim: wrap('2'),
  bold: wrap('1'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90'),
};

function tag(label, colorFn) {
  return colorFn ? colorFn(`[${label}]`) : `[${label}]`;
}

module.exports = { c, tag };
