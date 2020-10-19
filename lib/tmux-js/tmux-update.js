const fs = require('fs-extra');
const tmux = require('./tmux');
const path = `${__dirname}/update.json`;
let sessions;
let tmuxCommand;
let config;

function saveFile() {
    config.users[config.index].data = sessions;
    fs.writeFileSync(path, JSON.stringify(config.users, null, 2));
    console.log('all done');
}

function getProcess(session = 0, window = 0, pane = 0)
{
    if (session >= sessions.length) {
        console.log('saving file...');
        setTimeout(saveFile, 200);
        return;
    }

    if (!sessions[session].windows || window >= sessions[session].windows.length) {
        getProcess(++session);
        return;
    }

    if (!sessions[session].windows[window].panes || pane >= sessions[session].windows[window].panes.length) {
        getProcess(session, ++window);
        return;
    }

    let p = sessions[session].windows[window].panes[pane];
    tmux._command(`pstree -a -p ${p.pid} | grep -v {`).then(res => {
        delete p.pid;
        if (res) {
            let index = res.length > 1 ? 1 : 0;
            if (index) {
                while (index <= res.length && res[index].trim().substr(0,6) === '`-bash') index++;
                if (index >= res.length) index = res.length - 1;
            }
            let running = res[index].trim().split('').filter(l => { return !isNaN(l); }).join('').trim();
            tmux._command(`readlink -e /proc/${running}/cwd`).then(dir => {
                p.dir = dir[0];
                tmux._command(`ps aux | grep ${running} | grep -v grep`).then(cmd => {
                    if (index && cmd && cmd.length) {
                        p.command = cmd[0].split(' ').filter(s => { return !!s; }).splice(10).join(" "); //[0];
                        if (p.command === 'npm') p.command = 'npm run start';
                    }
                    getProcess(session, window, ++pane);
                });
            });
        } else {
            getProcess(session, window, ++pane);
        }
    }).catch(err => {
        console.log('pane error', err);
    })
}

function getPanes(session = 0, window = 0) {
    if (session === sessions.length) {
        getProcess();
        return;
    }

    tmux.getPanesByWindow(sessions[session].windows[window].id, tmuxCommand).then(res => {
        delete sessions[session].windows[window].id;
        delete sessions[session].windows[window].index;
        if (res) {
            sessions[session].windows[window].panes = res.map(pid => { return {pid} });
        }
        window++;
        if (window >= sessions[session].windows.length) { 
            session++;
            window = 0;
        }
        getPanes(session, window);
    }).catch(err => {
        console.log('error', session, window);
        console.log(err);
        fs.writeFileSync(`${__dirname}/error.json`, JSON.stringify(err, null, 2));
    })
}

function getWindows(index = 0) {
    if (index === sessions.length) {
        getPanes()
        return;
    }
    tmux.getWindows(sessions[index].id, tmuxCommand).then(res => {
        delete sessions[index].id;
        sessions[index].windows = res;
        getWindows(++index);
    })
}

function getSessions() {
    tmux.listSessions(tmuxCommand).then(res => {
        sessions = res;
        getWindows()
    });
}

function getConfig(user) {
    let users = (fs.existsSync(path)) ? JSON.parse(fs.readFileSync(path)) : [];
    if (!Array.isArray(users)) users = [{ user, data: users }];
    let index = users.findIndex(u => { return u.user === user; });
    if (index < 0) {
        index = users.length;
        users.push({ user, data: {} });
    }
    fs.writeFileSync(path, JSON.stringify(users, null, 2));
    config = { user, users, index };
    getSessions();
}

module.exports = {
    init(config) {
        tmuxCommand = `/proc/${config.pid}/exe`;
        getConfig(config.user);
    }
}