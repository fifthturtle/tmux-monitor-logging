// utilities module that processed commands that would normally be tmux CL commands and interprets them for JavaScript
// Essentially, this allows the TMUX Monitor to read the command line output

const shell = require('child_process');
const TMUX_PROGRAM = 'tmux/tmux-run';
const ipc = require('node-ipc');

ipc.config.id = 'tmux-monitor';
ipc.config.retry = 1500;
ipc.config.silent = true;

// IPC object allows communication with main program module during run time

function sendIPC(command, data = true) {
    ipc.connectTo('tmux-run', () => {
        ipc.of['tmux-run'].on('connect', () => {
            ipc.of['tmux-run'].emit(command, data);
            ipc.disconnect('tmux-run');
        });
    });
}

// _exec function uses shell to run tumx command and return the output

function _exec(cmd) { 
    return new Promise((resolve, reject) => {
        shell.exec(cmd, {}, (err, stdout) => {
            if (err) reject(err);
            resolve(stdout.split('\n').filter(s => { return !!s; }));
        });
    });
}

async function tmuxInstances(user)
{
    return (await _exec(`ps aux | grep "${TMUX_PROGRAM}" | grep ${user}`)).filter(ins => { return !(ins.includes('grep'));});
}

module.exports = {
    async whoami() {
        return (await _exec('whoami'))[0]
    },
    async tmuxInstancePID() {
        let user = await this.whoami();
        return _exec(`ps aux | grep tmux | grep ${user}`).then(res => {
            res = res.map(r => {
                return r.split(' ').filter(s => { return !!s; });
            });
            let process = res.find(x => {
                return x[10] === 'tmux';
            });
            return (process) ? process[1] : false;
        })
    },
    async tmuxIsRunning() {
        return (await tmuxInstances(await this.whoami())).length;
    },
    async killTmux() {
        let r = (await tmuxInstances(await this.whoami()))[0].split(" ").filter(s => { return !!s });
        if (r.length) process.kill(r[1], "SIGINT");
        return r.length;
    },
    async changeServerName(name) {
        let r = (await tmuxInstances(await this.whoami()))[0].split(" ").filter(s => { return !!s });
        if (r.length) sendIPC('change-server-name', name);
        return r.length;
    },
    async getTmux() {
        return await tmuxInstances(await this.whoami());
    },
    async tmuxVersion() {
        return (await _exec('tmux -V'))[0].split(" ").pop();
    }
}