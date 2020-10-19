// Manages tmux-hooks - basically 'events' - that lets program know when a session, window, pane, etc is created, deleted or modified in any way.

const Server = require('./tmux-session');
const tmux = require('./tmux');
const fs = require('fs-extra');
const path = require('path');
const hooks = JSON.parse(fs.readFileSync(path.join(appRoot, 'hooks.json')).toString());

module.exports = {
    clearHooks()
    {
        Object.keys(hooks).forEach(hookName => {
            tmux.clearHook(hookName);
        });
    },
    async setMonitorHooks() {
        await tmux.monitorActivity();
        Object.keys(hooks).forEach(hookName => {
            tmux.setMonitorHook(hookName, path.join(appRoot, 'hooks.sh'), hooks[hookName]);
        });
    }
}