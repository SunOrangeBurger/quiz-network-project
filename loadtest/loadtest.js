const { createSimClient } = require("./sim_clients");

function parseArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) {
    return fallback;
  }
  return Number(process.argv[index + 1]);
}

async function run() {
  const clientsCount = parseArg("clients", 25);
  const duration = parseArg("duration", 12000);
  const serverUrlIndex = process.argv.indexOf("--server");
  const serverUrl = serverUrlIndex > -1 ? process.argv[serverUrlIndex + 1] : "http://localhost:4000";

  const clients = Array.from({ length: clientsCount }, (_, index) =>
    createSimClient(index + 1, { serverUrl })
  );

  console.log(`Starting load test with ${clientsCount} clients for ${duration}ms`);
  await new Promise((resolve) => setTimeout(resolve, duration));

  const totals = clients.reduce(
    (acc, client) => {
      acc.sent += client.stats.sent;
      acc.acked += client.stats.acked;
      acc.failed += client.stats.failed;
      acc.retransmits += client.stats.retransmits;
      acc.rtts.push(...client.stats.rtts);
      return acc;
    },
    { sent: 0, acked: 0, failed: 0, retransmits: 0, rtts: [] }
  );

  const avgRtt = totals.rtts.length
    ? totals.rtts.reduce((sum, value) => sum + value, 0) / totals.rtts.length
    : 0;
  const throughput = totals.sent / (duration / 1000);

  const metricsResponse = await fetch(`${serverUrl}/metrics`);
  const metrics = await metricsResponse.json();

  console.log("average RTT:", avgRtt.toFixed(2), "ms");
  console.log("successful submissions:", totals.acked);
  console.log("failed submissions:", totals.failed);
  console.log("message throughput:", throughput.toFixed(2), "msg/s");
  console.log("retransmits:", totals.retransmits);
  console.log("server metrics snapshot:", JSON.stringify(metrics, null, 2));

  clients.forEach((client) => client.stop());
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
