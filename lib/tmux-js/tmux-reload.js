// This module is only used if the tmux logger has to be reset for any reason. This usually happens only during development and only when a major change has been made to 
// the tmux-monitor-logging program

const fs = require('fs-extra');
const tmux = require('./tmux');
const path = `${__dirname}/update.json`;

let sessions;

async function createPanes(session = 0, window = 0, pane = 0)
{
    let win = sessions[session].windows[window];
    let panes = win.panes;
    if (!panes || pane >= panes.length) {
        createWindow(session, ++window);
        return;
    }

    let p = panes[pane];
    let pIds = await getPanes(win.id);
    if (pane) {
        tmux.createPane(pIds[0]);
        pIds = await getPanes(win.id);
    }
    let id = pIds.pop();
    if (p.dir) {
        tmux.pipe(id, `cd ${p.dir}`);
        setTimeout(() => { 
            if (p.command) tmux.pipe(id, p.command);
        }, 500);
        createPanes(session, window, ++pane);
    } else {
        createPanes(session, window, ++pane);
    }
}

function createWindow(session = 0, window = 0)
{
    if (window >= sessions[session].windows.length) {
        createSession(++session);
        return;
    }

    let name = sessions[session].windows[window].name;
    let cmd = (window === 0) ? `rename-window -t '${sessions[session].id}' '${name}'` : `new-window -t '${sessions[session].id}' -n '${name}'`;
    tmux.tmux(cmd).then(async res => {
        sessions[session].windows[window].id = await getWindowID(sessions[session].id, name);
        createPanes(session, window);
    })
}

function getSessionID(name) {
    return tmux.tmux(`display -p -t '${name}' -F "#{session_id}"`).then(res => {
        return res[0];
    })
}

function getWindowID(id, name) {
    return tmux.tmux(`list-windows -t '${id}' -F "#{window_name}|#{window_id}"`).then(res => {
        return res.find(w => {
            return w.split('|')[0] === name;
        }).split('|').pop();
    })
}

function getPanes(id) {
    return tmux.tmux(`list-panes -t '${id}' -F "#{pane_id}"`).then(res => {
        return res;
    });
}

async function createSession(session = 0)
{
    if (session >= sessions.length) {
        let pane = (await getPanes(sessions[0].id))[0]
        tmux.prop('session_id').then(res => {
            tmux.selectPane({ pane });
            setTimeout(() => {
                tmux.tmux(`kill-session -t '${res[0]}'`);
            }, 500);
            return;
        })
        return;
    }

    let name = sessions[session].name;
    let cmd = (session === -1) ? `rename-session ${name}` : `new -s ${name} -d`;
    tmux.tmux(cmd).then(async res => {
        sessions[session].id = await getSessionID(name);
        createWindow(session);
    })
}

module.exports = {
    init(user) {
        if (fs.existsSync(path)) {
            let tmp = JSON.parse(fs.readFileSync(path));
            if (!Array.isArray(tmp)) tmp = [tmp];
            let currUser = tmp.find(u => { return u.user === user; });
            if (currUser) {
                sessions = currUser.data;
                createSession();
                return;
            }
        }
        console.log(`No update config found for ${user}`);
    }
}