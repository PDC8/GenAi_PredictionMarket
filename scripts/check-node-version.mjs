const major = Number.parseInt(process.versions.node.split('.')[0], 10);
const supportedMajor = 22;

if (major !== supportedMajor) {
  console.error(
    `[dev setup] Node ${process.versions.node} detected. Use Node ${supportedMajor}.x for stable Next.js dev runtime.\n` +
      `Run: nvm use ${supportedMajor}`
  );
  process.exit(1);
}
