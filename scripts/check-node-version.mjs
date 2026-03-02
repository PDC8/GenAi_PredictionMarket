const major = Number.parseInt(process.versions.node.split('.')[0], 10);
const minMajor = 22;

if (major < minMajor) {
  console.error(
    `[dev setup] Node ${process.versions.node} detected. Node ${minMajor}+ is required.\n` +
      `Run: nvm use ${minMajor}`
  );
  process.exit(1);
}
