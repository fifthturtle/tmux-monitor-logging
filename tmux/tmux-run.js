// This module creates and manages the Server object, which monitors the changes in TMUX instance and sends to Node Server
// While this module can technically be run from the command line, user should use the index.js file from parent folder

const process = require('process');
const ipc = require('node-ipc');
const path = require('path');
const program = require('commander');
const io = require('../lib/tmux-js/tmux-manager');

global.appRoot = path.resolve(__dirname);
let Server;

program
    .version('0.0.1')
    .option('-s, --server [Websocket Server URL/IP]', 'URL or IP address of server for websocket connection.')
    .option('-t, --tmux [TMUX Server Name]', 'name of this tmux server to be displayed in browser')
    .parse(process.argv)

// Connection to node server through WebSocket

io.connect(program.server).then(res => {
    Server = require('../lib/tmux-js').Server;
    Server.setName((program.tmux) ? program.tmux : 'default-server');
}).catch(err => {
    console.log(err);
})

let killed = false;

// This will kill the entire process as well as let the Node Server know that it can clear this TMUX instance

function killProcess() {
    if (killed) return;
    killed = true;
    require('../lib/tmux-js/tmux-hooks').clearHooks();
    require('../lib/tmux-js/tmux-pipe').deletePipe();

    ipc.server.stop();
    Server.kill().then(res => {
        setTimeout(() => {
            process.kill(0);
        }, res);
    });
}

ipc.config.id = 'tmux-run';
ipc.config.retry = 1500;
ipc.config.silent = true;

// TMUXName is the string name of the TMUX Instance Server. It is not important programmatically, only for user purposes. It has to be changed here as TMUX has no native way
// to change server name - this is technically not part of the TMUX instance

ipc.serve(() => ipc.server.on('change-server-name', name => {
    Server.setName(name);
}));

process.on('SIGINT', (signal) => {
    killProcess();
});

// IPC server allows communication between different processes

ipc.server.start();