class MetricsService {
  constructor() {
    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      messagesError: 0,
      responseTimes: [],
      avgResponseTime: 0,
      startTime: Date.now(),
    };
  }

  incrementMessagesReceived() {
    this.metrics.messagesReceived++;
  }

  incrementMessagesSent() {
    this.metrics.messagesSent++;
  }

  incrementMessagesError() {
    this.metrics.messagesError++;
  }

  recordResponseTime(time) {
    this.metrics.responseTimes.push(time);
    if (this.metrics.responseTimes.length > 100) {
      this.metrics.responseTimes.shift();
    }
    const sum = this.metrics.responseTimes.reduce((a, b) => a + b, 0);
    this.metrics.avgResponseTime = Math.round(sum / this.metrics.responseTimes.length);
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: Math.round((Date.now() - this.metrics.startTime) / 1000),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    };
  }

  reset() {
    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      messagesError: 0,
      responseTimes: [],
      avgResponseTime: 0,
      startTime: Date.now(),
    };
  }
}

module.exports = new MetricsService();
