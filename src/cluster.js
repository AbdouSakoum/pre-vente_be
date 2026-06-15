const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`Master démarré — fork de ${numCPUs} workers`);
  for (let i = 0; i < numCPUs; i++) cluster.fork();
  cluster.on('exit', (worker) => {
    console.warn(`Worker ${worker.process.pid} mort — redémarrage`);
    cluster.fork();
  });
} else {
  require('./app.js');
}
