var registerComponent = require('../core/component').registerComponent;
var bind = require('../utils/bind');
var checkControllerPresentAndSetup = require('../utils/tracked-controls').checkControllerPresentAndSetup;
var trackedControlsUtils = require('../utils/tracked-controls');
var emitIfAxesChanged = trackedControlsUtils.emitIfAxesChanged;
var onButtonEvent = trackedControlsUtils.onButtonEvent;

var DAYDREAM_CONTROLLER_MODEL_OBJ_URL = 'vr_controller_daydream.obj';
var DAYDREAM_CONTROLLER_MODEL_OBJ_MTL = 'vr_controller_daydream.mtl';

var GAMEPAD_ID_PREFIX = 'Daydream Controller';

/**
 * Daydream controls.
 * Interface with Daydream controller and map Gamepad events to
 * controller buttons: trackpad, menu, system
 * Load a controller model and highlight the pressed buttons.
 */
module.exports.Component = registerComponent('daydream-controls', {
  schema: {
    hand: {default: ''},  // This informs the degenerate arm model.
    buttonColor: {type: 'color', default: '#000000'},
    buttonTouchedColor: {type: 'color', default: '#777777'},
    buttonHighlightColor: {type: 'color', default: '#FFFFFF'},
    model: {default: true},
    rotationOffset: {default: 0},
    armModel: {default: true}
  },

  /**
   * Button IDs:
   * 0 - trackpad
   * 1 - menu (never dispatched on this layer)
   * 2 - system (never dispatched on this layer)
   */
  mapping: {
    axes: {trackpad: [0, 1]},
    buttons: ['trackpad', 'menu', 'system']
  },

  bindMethods: function () {
    this.onModelLoaded = bind(this.onModelLoaded, this);
    this.onControllersUpdate = bind(this.onControllersUpdate, this);
    this.checkIfControllerPresent = bind(this.checkIfControllerPresent, this);
    this.removeControllersUpdateListener = bind(this.removeControllersUpdateListener, this);
    this.onAxisMoved = bind(this.onAxisMoved, this);
  },

  init: function () {
    var self = this;
    this.animationActive = 'pointing';
    this.onButtonChanged = bind(this.onButtonChanged, this);
    this.onButtonDown = function (evt) { onButtonEvent(evt.detail.id, 'down', self); };
    this.onButtonUp = function (evt) { onButtonEvent(evt.detail.id, 'up', self); };
    this.onButtonTouchStart = function (evt) { onButtonEvent(evt.detail.id, 'touchstart', self); };
    this.onButtonTouchEnd = function (evt) { onButtonEvent(evt.detail.id, 'touchend', self); };
    this.onAxisMoved = bind(this.onAxisMoved, this);
    this.controllerPresent = false;
    this.lastControllerCheck = 0;
    this.bindMethods();
    this.checkControllerPresentAndSetup = checkControllerPresentAndSetup;  // To allow mock.
    this.emitIfAxesChanged = emitIfAxesChanged;  // To allow mock.
  },

  addEventListeners: function () {
    var el = this.el;
    el.addEventListener('buttonchanged', this.onButtonChanged);
    el.addEventListener('buttondown', this.onButtonDown);
    el.addEventListener('buttonup', this.onButtonUp);
    el.addEventListener('touchstart', this.onButtonTouchStart);
    el.addEventListener('touchend', this.onButtonTouchEnd);
    el.addEventListener('model-loaded', this.onModelLoaded);
    el.addEventListener('axismove', this.onAxisMoved);
    this.controllerEventsActive = true;
  },

  removeEventListeners: function () {
    var el = this.el;
    el.removeEventListener('buttonchanged', this.onButtonChanged);
    el.removeEventListener('buttondown', this.onButtonDown);
    el.removeEventListener('buttonup', this.onButtonUp);
    el.removeEventListener('touchstart', this.onButtonTouchStart);
    el.removeEventListener('touchend', this.onButtonTouchEnd);
    el.removeEventListener('model-loaded', this.onModelLoaded);
    el.removeEventListener('axismove', this.onAxisMoved);
    this.controllerEventsActive = false;
  },

  checkIfControllerPresent: function () {
    this.checkControllerPresentAndSetup(this, GAMEPAD_ID_PREFIX, {hand: this.data.hand});
  },

  play: function () {
    this.checkIfControllerPresent();
    this.addControllersUpdateListener();
  },

  pause: function () {
    this.removeEventListeners();
    this.removeControllersUpdateListener();
  },

  injectTrackedControls: function () {
    var el = this.el;
    var data = this.data;
    el.setAttribute('tracked-controls', {
      armModel: data.armModel,
      hand: data.hand,
      idPrefix: GAMEPAD_ID_PREFIX,
      rotationOffset: data.rotationOffset
    });
    if (!this.data.model) { return; }
    this.el.setAttribute('obj-model', {
      obj: DAYDREAM_CONTROLLER_MODEL_OBJ_URL,
      mtl: DAYDREAM_CONTROLLER_MODEL_OBJ_MTL
    });
  },

  addControllersUpdateListener: function () {
    this.el.sceneEl.addEventListener('controllersupdated', this.onControllersUpdate, false);
  },

  removeControllersUpdateListener: function () {
    this.el.sceneEl.removeEventListener('controllersupdated', this.onControllersUpdate, false);
  },

  onControllersUpdate: function () {
    this.checkIfControllerPresent();
  },

  onModelLoaded: function (evt) {
    var controllerObject3D = evt.detail.model;
    var buttonMeshes;
    if (!this.data.model) { return; }
    buttonMeshes = this.buttonMeshes = {};
    buttonMeshes.menu = controllerObject3D.getObjectByName('AppButton_AppButton_Cylinder.004');
    buttonMeshes.system = controllerObject3D.getObjectByName('HomeButton_HomeButton_Cylinder.005');
    buttonMeshes.trackpad = controllerObject3D.getObjectByName('TouchPad_TouchPad_Cylinder.003');
    // Offset pivot point.
    controllerObject3D.position.set(0, 0, -0.04);
  },

  onAxisMoved: function (evt) {
    this.emitIfAxesChanged(this, this.mapping.axes, evt);
  },

  onButtonChanged: function (evt) {
    var button = this.mapping.buttons[evt.detail.id];
    if (!button) return;
    // Pass along changed event with button state, using button mapping for convenience.
    this.el.emit(button + 'changed', evt.detail.state);
  },

  updateModel: function (buttonName, evtName) {
    if (!this.data.model) { return; }
    this.updateButtonModel(buttonName, evtName);
  },

  updateButtonModel: function (buttonName, state) {
    var buttonMeshes = this.buttonMeshes;
    if (!buttonMeshes || !buttonMeshes[buttonName]) { return; }
    var color;
    switch (state) {
      case 'down':
        color = this.data.buttonHighlightColor;
        break;
      case 'touchstart':
        color = this.data.buttonTouchedColor;
        break;
      default:
        color = this.data.buttonColor;
    }
    buttonMeshes[buttonName].material.color.set(color);
  }
});
