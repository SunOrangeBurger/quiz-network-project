function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createNetSim(metrics) {
  const config = {
    packetLossPercent: 0,
    minDelayMs: 0,
    maxDelayMs: 0
  };

  function shouldDrop() {
    return Math.random() * 100 < config.packetLossPercent;
  }

  function getDelay() {
    if (config.maxDelayMs <= 0) {
      return 0;
    }
    return randomBetween(config.minDelayMs, Math.max(config.minDelayMs, config.maxDelayMs));
  }

  function applyOutbound(sendFn, onDrop) {
    if (shouldDrop()) {
      metrics.recordDrop();
      if (typeof onDrop === "function") {
        onDrop();
      }
      return;
    }
    const delay = getDelay();
    setTimeout(sendFn, delay);
  }

  function applyInbound(handleFn, onDrop) {
    if (shouldDrop()) {
      metrics.recordDrop();
      if (typeof onDrop === "function") {
        onDrop();
      }
      return;
    }
    const delay = getDelay();
    setTimeout(handleFn, delay);
  }

  function update(next = {}) {
    config.packetLossPercent = Number(next.packetLossPercent ?? config.packetLossPercent) || 0;
    config.minDelayMs = Number(next.minDelayMs ?? config.minDelayMs) || 0;
    config.maxDelayMs = Number(next.maxDelayMs ?? config.maxDelayMs) || 0;
    if (config.maxDelayMs < config.minDelayMs) {
      config.maxDelayMs = config.minDelayMs;
    }
    return getConfig();
  }

  function getConfig() {
    return { ...config };
  }

  return {
    applyInbound,
    applyOutbound,
    update,
    getConfig
  };
}

module.exports = { createNetSim };
