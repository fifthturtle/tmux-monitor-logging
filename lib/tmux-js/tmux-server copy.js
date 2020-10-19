const Session = require('./tmux-session');
const tmux = require('./tmux');
const manager = require('./tmux-manager');

const sessions = {};
const pipe = require('./tmux-pipe');
const hooks = require('./tmux-hooks');

let serverName = "default";

async function initServer()
{
    await tmux.listSessions().then(res => {
        res.forEach(session => {
            sessions[session.id] = new Session(session.id, session.name);
        });
    });
}

function createSession(session)
{
    if (sessions[session.id]) return;
    sessions[session.id] = new Session(session.id, session.name);
}

function addSessions(sessions)
{
    sessions.forEach(session => {
        createSession(session);
    })
}

function removeSessions(newSessions)
{
    newSessions.forEach(s => {
        sessions[s].destroy();
        delete sessions[s];
    });
}

manager.socket().on('connect', () => {
    manager.socket().emit('tmux-init', { components: [], serverName });
    initServer();
    pipe.connectPipe(sessions);
    setTimeout(() => {
        hooks.setMonitorHooks();
    }, 500);
});

module.exports = {
    numSessions() {
        return Object.values(sessions).length;
    },
    setName(name) {
        serverName = name;
        manager.socket().emit('tmux-update', { key: 'name', value: name });
    },
    kill() {
        return Promise.all(Object.values(sessions).map(s => {
            return s.setStatusColor('green');
        })).then(res => {
            return Promise.resolve(1000);
        }).catch(err => {
            return Promise.resolve(1000);
        })
    }
}