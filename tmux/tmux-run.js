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

io.connect(program.server).then(res => {
    Server = require('../lib/tmux-js').Server;
    Server.setName((program.tmux) ? program.tmux : 'default-server');
}).catch(err => {
    console.log(err);
})

let killed = false;

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

ipc.serve(() => ipc.server.on('change-server-name', name => {
    Server.setName(name);
}));

process.on('SIGINT', (signal) => {
    killProcess();
});

ipc.server.start();

/*
const process = require('process');
const ipc = require('node-ipc');
const path = require('path');
const program = require('commander');
const io = require('../lib/tmux-js/tmux-manager');
const tmuxUtil = require('../lib/tmux-monitor-utilities');
const { Server } = require('../lib/tmux-js');

global.appRoot = path.resolve(__dirname);
let servers;

program
    .version('0.0.1')
    .option('-s, --server [Websocket Server URL/IP]', 'URL or IP address of server for websocket connection.')
    .option('-t, --tmux [TMUX Server Name]', 'name of this tmux server to be displayed in browser')
    .parse(process.argv)

io.connect(program.server).then(async res => {
    let user = await tmuxUtil.whoami();
    servers[user] = new Server(user, 'default-name');
    servers[user].setName((program.tmux) ? program.tmux : 'default-server');
}).catch(err => {
    console.log(err);
})

let killed = false;

async function killProcess() {
    if (killed) return;
    killed = true;
    let user = await tmuxUtil.whoami();
    require('../lib/tmux-js/tmux-hooks').clearHooks();
    require('../lib/tmux-js/tmux-pipe').deletePipe();

    ipc.server.stop();
    servers[user].kill().then(res => {
        setTimeout(() => {
            process.kill(0);
        }, res);
    });
}

ipc.config.id = 'tmux-run';
ipc.config.retry = 1500;
ipc.config.silent = true;

ipc.serve(() => ipc.server.on('change-server-name', async name => {
    servers[await tmuxUtil.whoami()].setName(name);
}));

process.on('SIGINT', (signal) => {
    killProcess();
});

ipc.server.start();
// */