function createMetrics() {
  const startedAt = Date.now();
  const counters = {
    inboundMessages: 0,
    outboundMessages: 0,
    droppedMessages: 0,
    retransmits: 0
  };

  const messageBuckets = [];
  const rttByClient = new Map();

  function noteBucket() {
    const now = Date.now();
    messageBuckets.push({ ts: now, count: 1 });
    while (messageBuckets.length && now - messageBuckets[0].ts > 10000) {
      messageBuckets.shift();
    }
  }

  function recordInbound() {
    counters.inboundMessages += 1;
    noteBucket();
  }

  function recordOutbound() {
    counters.outboundMessages += 1;
    noteBucket();
  }

  function recordDrop() {
    counters.droppedMessages += 1;
  }

  function recordRetransmit() {
    counters.retransmits += 1;
  }

  function recordRTT(clientId, rttMs) {
    const samples = rttByClient.get(clientId) || [];
    samples.push(rttMs);
    while (samples.length > 20) {
      samples.shift();
    }
    rttByClient.set(clientId, samples);
  }

  function averageRTT() {
    const allSamples = Array.from(rttByClient.values()).flat();
    if (!allSamples.length) {
      return 0;
    }
    return allSamples.reduce((sum, value) => sum + value, 0) / allSamples.length;
  }

  function messagesPerSecond() {
    const now = Date.now();
    const relevant = messageBuckets.filter((bucket) => now - bucket.ts <= 5000);
    const total = relevant.reduce((sum, bucket) => sum + bucket.count, 0);
    return total / 5;
  }

  function snapshot(extra = {}) {
    const totalMessages = counters.inboundMessages + counters.outboundMessages;
    return {
      uptime: (Date.now() - startedAt) / 1000,
      avgRTT_ms: Number(averageRTT().toFixed(2)),
      messagesPerSecond: Number(messagesPerSecond().toFixed(2)),
      dropRate: totalMessages ? Number((counters.droppedMessages / totalMessages).toFixed(3)) : 0,
      retransmits: counters.retransmits,
      ...extra
    };
  }

  return {
    recordInbound,
    recordOutbound,
    recordDrop,
    recordRetransmit,
    recordRTT,
    snapshot
  };
}

module.exports = { createMetrics };
