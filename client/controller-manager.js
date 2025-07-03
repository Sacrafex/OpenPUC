const EventEmitter = require('events');

class ControllerManager extends EventEmitter {
    constructor() {
        super();
        
        this.controllers = new Map();
        this.controllerStates = new Map();
        this.pollingInterval = null;
        this.deadzone = 0.1;
        this.updateRate = 20; // update rate, change later *
        
        // button mappings
        this.buttonMappings = {
            'xbox': {
                0: 'A',
                1: 'B', 
                2: 'X',
                3: 'Y',
                4: 'LB',
                5: 'RB',
                6: 'LT',
                7: 'RT',
                8: 'Back',
                9: 'Start',
                10: 'LS',
                11: 'RS',
                12: 'DPad_Up',
                13: 'DPad_Down',
                14: 'DPad_Left',
                15: 'DPad_Right',
                16: 'Xbox'
            },
            'ps4': {
                0: 'X',
                1: 'Circle',
                2: 'Square', 
                3: 'Triangle',
                4: 'L1',
                5: 'R1',
                6: 'L2',
                7: 'R2',
                8: 'Share',
                9: 'Options',
                10: 'L3',
                11: 'R3',
                12: 'DPad_Up',
                13: 'DPad_Down',
                14: 'DPad_Left',
                15: 'DPad_Right',
                16: 'PS'
            }
        };
        
        this.axisNames = {
            0: 'Left_X',
            1: 'Left_Y',
            2: 'Right_X',
            3: 'Right_Y',
            4: 'LT',
            5: 'RT'
        };
    }
    
    initialize() {
        // gamepad api stuff for those windows users
        if (typeof navigator !== 'undefined' && navigator.getGamepads) {
            this.startPolling();
            this.emit('initialized');
            return true;
        } else {
            this.emit('error', 'Gamepad API not supported');
            return false;
        }
    }
    
    startPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        
        this.pollingInterval = setInterval(() => {
            this.pollControllers();
        }, this.updateRate);
    }
    
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
    
    pollControllers() {
        if (typeof navigator === 'undefined') return;
        
        const gamepads = navigator.getGamepads();
        const currentConnected = new Set();
        
        for (let i = 0; i < gamepads.length; i++) {
            const gamepad = gamepads[i];
            if (gamepad) {
                currentConnected.add(i);
                this.updateController(i, gamepad);
                
                // Check for new controllers
                if (!this.controllers.has(i)) {
                    this.onControllerConnected(i, gamepad);
                }
            }
        }
        
        // check for disconnection
        for (const [id] of this.controllers) {
            if (!currentConnected.has(id)) {
                this.onControllerDisconnected(id);
            }
        }
    }
    
    onControllerConnected(id, gamepad) {
        const controllerInfo = {
            id: id,
            name: gamepad.id,
            type: this.detectControllerType(gamepad.id),
            axes: gamepad.axes.length,
            buttons: gamepad.buttons.length,
            timestamp: gamepad.timestamp
        };
        
        this.controllers.set(id, controllerInfo);
        this.controllerStates.set(id, {
            axes: new Array(gamepad.axes.length).fill(0),
            buttons: 0,
            rawButtons: new Array(gamepad.buttons.length).fill(false),
            pov: -1
        });
        
        console.log(`Controller connected: ${controllerInfo.name} (ID: ${id})`);
        this.emit('controllerConnected', controllerInfo);
    }
    
    onControllerDisconnected(id) {
        const controller = this.controllers.get(id);
        if (controller) {
            console.log(`Controller disconnected: ${controller.name} (ID: ${id})`);
            this.controllers.delete(id);
            this.controllerStates.delete(id);
            this.emit('controllerDisconnected', id);
        }
    }
    
    updateController(id, gamepad) {
        const state = this.controllerStates.get(id);
        if (!state) return;
        
        let changed = false;
        
        // deadzone
        for (let i = 0; i < gamepad.axes.length && i < 12; i++) {
            let value = gamepad.axes[i];
            if (Math.abs(value) < this.deadzone) {
                value = 0;
            }
            
            if (Math.abs(state.axes[i] - value) > 0.01) {
                state.axes[i] = value;
                changed = true;
            }
        }
        
        // update buttons
        let buttonMask = 0;
        for (let i = 0; i < gamepad.buttons.length && i < 32; i++) {
            const pressed = gamepad.buttons[i].pressed;
            if (pressed) {
                buttonMask |= (1 << i);
            }
            
            if (state.rawButtons[i] !== pressed) {
                state.rawButtons[i] = pressed;
                changed = true;
            }
        }
        
        if (state.buttons !== buttonMask) {
            state.buttons = buttonMask;
            changed = true;
        }
        
        // dpad angle - I may have stolen this
        const povAngle = this.calculatePOV(gamepad);
        if (state.pov !== povAngle) {
            state.pov = povAngle;
            changed = true;
        }
        
        if (changed) {
            this.emit('controllerUpdate', {
                id: id,
                axes: [...state.axes],
                buttons: state.buttons,
                rawButtons: [...state.rawButtons],
                pov: state.pov
            });
        }
    }
    
    calculatePOV(gamepad) {
        // find dpad buttons - I may have also stolen this
        if (gamepad.buttons.length < 16) return -1;
        
        const up = gamepad.buttons[12] && gamepad.buttons[12].pressed;
        const down = gamepad.buttons[13] && gamepad.buttons[13].pressed;
        const left = gamepad.buttons[14] && gamepad.buttons[14].pressed;
        const right = gamepad.buttons[15] && gamepad.buttons[15].pressed;
        
        // Convert button combination to angle
        if (up && right) return 45;
        if (down && right) return 135;
        if (down && left) return 225;
        if (up && left) return 315;
        if (up) return 0;
        if (right) return 90;
        if (down) return 180;
        if (left) return 270;
        
        return -1; // No direction pressed
    }
    
    detectControllerType(id) {
        const idLower = id.toLowerCase();
        
        if (idLower.includes('xbox') || idLower.includes('xinput')) {
            return 'xbox';
        } else if (idLower.includes('playstation') || idLower.includes('ps4') || idLower.includes('dualshock')) {
            return 'ps4';
        } else if (idLower.includes('logitech')) {
            return 'logitech';
        }
        
        return 'generic';
    }
    
    // Public methods
    getConnectedControllers() {
        return Array.from(this.controllers.values());
    }
    
    getControllerState(id) {
        return this.controllerStates.get(id);
    }
    
    getControllerInfo(id) {
        return this.controllers.get(id);
    }
    
    setDeadzone(deadzone) {
        this.deadzone = Math.max(0, Math.min(1, deadzone));
    }
    
    getDeadzone() {
        return this.deadzone;
    }
    
    isControllerConnected(id) {
        return this.controllers.has(id);
    }
    
    getButtonName(controllerId, buttonIndex) {
        const controller = this.controllers.get(controllerId);
        if (!controller) return `Button ${buttonIndex}`;
        
        const mapping = this.buttonMappings[controller.type];
        return mapping ? mapping[buttonIndex] || `Button ${buttonIndex}` : `Button ${buttonIndex}`;
    }
    
    getAxisName(axisIndex) {
        return this.axisNames[axisIndex] || `Axis ${axisIndex}`;
    }
    
    // Shutdown
    shutdown() {
        this.stopPolling();
        this.controllers.clear();
        this.controllerStates.clear();
        this.emit('shutdown');
    }
    
    // Vibration support (if available)
    vibrate(controllerId, weakMagnitude = 0, strongMagnitude = 0, duration = 100) {
        if (typeof navigator === 'undefined') return false;
        
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[controllerId];
        
        if (gamepad && gamepad.vibrationActuator) {
            gamepad.vibrationActuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: duration,
                weakMagnitude: weakMagnitude,
                strongMagnitude: strongMagnitude
            });
            return true;
        }
        
        return false;
    }
}

// For use in renderer process (browser environment)
class RendererControllerManager extends ControllerManager {
    constructor() {
        super();
        this.isRenderer = true;
    }
    
    // Override for renderer-specific functionality
    initialize() {
        if (super.initialize()) {
            // Listen for window focus/blur to pause/resume polling
            window.addEventListener('focus', () => this.startPolling());
            window.addEventListener('blur', () => this.stopPolling());
            return true;
        }
        return false;
    }
}

module.exports = { ControllerManager, RendererControllerManager };
