var BadgeTypes = new Meteor.Collection("badgetypes");

if (Meteor.isClient) (function setupClient() {
  Meteor.subscribe("rockabadge.adminUser");
  Meteor.subscribe("rockabadge.badgeTypes");
  
  var isAdminUser = function() {
    var user = Meteor.user();
    if (!user)
      return false;
    return !!user.isAdmin;
  };
  
  var makeEditableWhenClicked = function(options) {
    var name = options.name;
    var allow = options.allow || function() { return true; };
    var save = options.save;
    var keyName = "editing_" + name;
    
    Session.set(keyName, null);
    
    Template[name].editing = function() {
      return (this._id == Session.get(keyName));
    };

    Template[name].events(okCancelEvents('#edit', {
      ok: function(value) {
        save.call(this, value);
        Session.set(keyName, null);
      },
      cancel: function() {
        Session.set(keyName, null);
      }
    }));

    Template[name].events({
      'click .display': function(evt, tmpl) {
        if (allow.call(this)) {
          Session.set(keyName, this._id);
          Meteor.flush();
          tmpl.find("#edit").focus();
          tmpl.find("#edit").select();
        }
      }
    });
  };
  
  if (typeof Handlebars !== 'undefined') {
    Handlebars.registerHelper('adminUser', isAdminUser);
  }
  
  ////////// Helpers for in-place editing //////////

  // https://github.com/meteor/meteor/blob/master/examples/todos/client/todos.js
  // Returns an event map that handles the "escape" and "return" keys and
  // "blur" events on a text input (given by selector) and interprets them
  // as "ok" or "cancel".
  var okCancelEvents = function (selector, callbacks) {
    var ok = callbacks.ok || function () {};
    var cancel = callbacks.cancel || function () {};

    var events = {};
    events['keyup '+selector+', keydown '+selector+', focusout '+selector] =
      function (evt) {
        if (evt.type === "keydown" && evt.which === 27) {
          // escape = cancel
          cancel.call(this, evt);

        } else if (evt.type === "keyup" && evt.which === 13 ||
                   evt.type === "focusout") {
          // blur/return/enter = ok/submit if non-empty
          var value = String(evt.target.value || "");
          if (value)
            ok.call(this, value, evt);
          else
            cancel.call(this, evt);
        }
      };
    return events;
  };

  makeEditableWhenClicked({
    name: "badgeTypeDesc",
    allow: isAdminUser,
    save: function(value) {
      BadgeTypes.update({_id: this._id}, {$set: {description: value}});
    }
  });
  
  makeEditableWhenClicked({
    name: "badgeTypeName",
    allow: isAdminUser,
    save: function(value) {
      BadgeTypes.update({_id: this._id}, {$set: {name: value}});
    }
  });
  
  Template.badgeTypeList.badgeTypes = function() {
    return BadgeTypes.find();
  };
  
  Template.badgeTypeList.events({
    'click .add-badgetype': function(evt) {
      BadgeTypes.insert({
        name: "A new badge",
        image: "",
        description: "This is a cool new badge."
      });
    }
  });
  
  Template.badgeType.events({
    'click .remove-badgetype': function(evt) {
      BadgeTypes.remove(this._id);
    }
  });
})();

if (Meteor.isServer) (function setupServer() {
  var isAdminUser = function(userId) {
    return !!Meteor.users.findOne({_id: userId}).isAdmin;
  };
  
  Accounts.loginServiceConfiguration.remove({
    service: "facebook"
  });
  Accounts.loginServiceConfiguration.insert({
    service: "facebook",
    appId: process.env["FB_APP_ID"],
    secret: process.env["FB_APP_SECRET"]
  });
  BadgeTypes.allow({
    insert: isAdminUser,
    remove: isAdminUser,
    update: isAdminUser
  });
  Meteor.publish("rockabadge.badgeTypes", function() {
    return BadgeTypes.find();
  });
  Meteor.publish("rockabadge.adminUser", function() {
    if (this.userId)
      return Meteor.users.find({
        _id: this.userId
      }, {
        fields: {
          isAdmin: 1
        }
      });
  });
})();
