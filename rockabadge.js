var BadgeTypes = new Meteor.Collection("badgetypes");

if (Meteor.isClient) (function setupClient() {
  Meteor.subscribe("rockabadge.adminUser");
  Meteor.subscribe("rockabadge.facebookInfo");
  Meteor.subscribe("rockabadge.badgeTypes");
  Session.set("nominating", null);
  Session.set("friends", []);
  
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
    
    Template[name].editable = function() {
      if (allow.call(this))
        return "editable";
    };
    
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
    Handlebars.registerHelper('friends', function() {
      var user = Meteor.user();
      var friends = Session.get("friends").map(function(friend) {
        return friend.name;
      });
      // Allow the user to be a friend of themself.
      if (user)
        friends.push(user.profile.name);
      return JSON.stringify(friends);
    });
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

        } else if (evt.type === "keyup" && evt.which === 13 
                                        && !evt.shiftKey ||
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
    name: "badgeTypeImage",
    allow: isAdminUser,
    save: function(value) {
      BadgeTypes.update({_id: this._id}, {$set: {image: value}});
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
        name: "Badge name",
        image: Meteor.absoluteUrl("gray-badge.png"),
        description: "Badge description"
      });
    }
  });
  
  Template.badgeType.nominating = function() {
    return (this._id === Session.get("nominating"));
  };
  
  Template.badgeType.events({
    'click .nominate': function(evt, template) {
      Session.set("nominating", this._id);
      Meteor.flush();
      template.find(".friends-list").focus();
      $.ajax({
        url: "https://graph.facebook.com/me/friends?access_token=" +
             Meteor.user().services.facebook.accessToken,
        crossDomain: true,
        dataType: "json",
        error: function(req) {
          console.log("CRAP", req);
        },
        success: function(data) {
          Session.set("friends", data.data);
        }
      });
    },
    'click .remove-badgetype': function(evt) {
      BadgeTypes.remove(this._id);
    }
  });
})();

if (Meteor.isServer) (function setupServer() {
  var isAdminUser = function(userId) {
    return !!Meteor.users.findOne({_id: userId}).isAdmin;
  };
  
  if (process.env["FB_APP_ID"]) {
    Accounts.loginServiceConfiguration.remove({
      service: "facebook"
    });
    Accounts.loginServiceConfiguration.insert({
      service: "facebook",
      appId: process.env["FB_APP_ID"],
      secret: process.env["FB_APP_SECRET"]
    });
  }
  BadgeTypes.allow({
    insert: isAdminUser,
    remove: isAdminUser,
    update: isAdminUser
  });
  Meteor.publish("rockabadge.badgeTypes", function() {
    return BadgeTypes.find();
  });
  Meteor.publish("rockabadge.facebookInfo", function() {
    if (this.userId)
      return Meteor.users.find({
        _id: this.userId
      }, {
        fields: {
          'services.facebook.id': 1,
          'services.facebook.accessToken': 1
        }
      });
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
