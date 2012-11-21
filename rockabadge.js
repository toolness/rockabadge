var BadgeTypes = new Meteor.Collection("badgetypes");
var Nominations = new Meteor.Collection("nominations");

var getUser = function(userId) {
  return userId ? Meteor.users.findOne({_id: userId}) : Meteor.user();
};

var isAdminUser = function(userId) {
  return !!((getUser(userId) || {}).isAdmin);
};

var areNominationsRevocable = function(userId, docs) {
  var user = getUser(userId);
  if (!user)
    return false;
  if (user.isAdmin)
    return true;
  for (var i = 0; i < docs.length; i++)
    if (docs[i].nominator.id != user.services.facebook.id)
      return false;
  return true;
};

if (Meteor.isClient) (function setupClient() {
  Meteor.subscribe("rockabadge.adminUser");
  Meteor.subscribe("rockabadge.facebookInfo");
  Meteor.subscribe("rockabadge.badgeTypes");
  Meteor.subscribe("rockabadge.nominations");
  Session.set("nominating", null);
  
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
    Handlebars.registerHelper('nicedate', function(date) {
      date = new Date(date);
      return date.toLocaleDateString();
    });
    Handlebars.registerHelper('friends', function() {
      var user = Meteor.user();
      var friends = (user.friends || []).map(function(friend) {
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
      Meteor.call('refreshFriends');
    },
    'click .remove-badgetype': function(evt) {
      if (confirm("Are you sure you want to delete this badge type? " +
                  "This action cannot be undone."))
        BadgeTypes.remove(this._id);
    }
  });
  
  Template.nominateForm.events({
    'click .close': function() {
      Session.set("nominating", null);
    },
    'click .nominate': function(evt, template) {
      var user = Meteor.user();
      var friends = user.friends || [];
      var nominee = template.find('.friends-list').value;
      var nomineeID = null;
      
      if (!nominee)
        return;
      
      if (nominee == user.profile.name) {
        nomineeID = user.services.facebook.id;
      } else {
        for (var i = 0; i < friends.length; i++) {
          if (friends[i].name == nominee) {
            nomineeID = friends[i].id;
          }
        }
      }
      if (nomineeID === null)
        return alert("Not a valid user.");
      Meteor.call('nominate', nominee, nomineeID, this._id,
        function(err, result) {
          Session.set("nominating", null);
          if (err)
            return alert("error nominating!");
          if (!result)
            return alert("you've already nominated this person.");
        }
      );
    }
  });

  Template.nominations.isRecipient = function() {
    var facebookId = Meteor.user().services.facebook.id;
    return (this.nominee.id == facebookId &&
            this.nominator.isAdmin &&
            Session.get("OpenBadges_loaded"));
  };
  
  Template.nominations.isRevocable = function() {
    return areNominationsRevocable(Meteor.userId(), [this]);
  };

  Template.nominations.isAwarded = function() {
    var badge = Nominations.findOne({
      'nominee.id': this.nominee.id,
      'nominator.isAdmin': true,
      badge: this.badge
    });
    return !!badge;
  };
  
  Template.nominations.events({
    'click .push-badge': function(evt) {
      var url = Meteor.absoluteUrl('assertions/' + this._id);
      OpenBadges.issue([url]);
    },
    'click .revoke-nomination': function(evt) {
      Nominations.remove({_id: this._id});
    },
    'click .award-badge': function(evt, template) {
      Meteor.call('nominate', this.nominee.name, this.nominee.id, this.badge);
    },
    'click .send-nominee-message': function(evt, template) {
      var appId = Accounts.loginServiceConfiguration.findOne({
        service: "facebook"
      }).appId;
      var badge = BadgeTypes.findOne({_id: this.badge});
      var link = encodeURIComponent(Meteor.absoluteUrl().match(/localhost/) ?
                 "http://rockawayhelp.com/" : Meteor.absoluteUrl());
      var picture = encodeURIComponent(badge.image);
      var name = encodeURIComponent(badge.name);
      var description = encodeURIComponent(badge.description);
      var redirect_uri = encodeURIComponent(Meteor.absoluteUrl("close"));
      var url = "https://www.facebook.com/dialog/send?app_id=" + appId +
                "&name=" + name + "&link=" + link + "&display=popup" +
                "&picture=" + picture + "&description=" + description +
                "&redirect_uri=" + redirect_uri + "&to=" +
                this.nominee.id;
      window.open(url, undefined, "width=580,height=400");
    }
  });
  
  Template.nominations.isNominator = function() {
    var userId = Meteor.user().services.facebook.id;
    return (userId != this.nominee.id &&
            (userId == this.nominator.id || isAdminUser()));
  };
  
  Template.nominations.nominations = function() {
    var userFacebookId = Meteor.user().services.facebook.id;
    var noms = Nominations.find({badge: this._id});
    return noms;
  };
  
  if (!Session.get("OpenBadges_loaded"))
    (function() {
      var script = document.createElement('script');
      script.setAttribute("src", "http://beta.openbadges.org/issuer.js");
      script.setAttribute("async", "");
      script.onload = function() {
        Session.set("OpenBadges_loaded", true);
      };
      document.documentElement.appendChild(script);
    })();
  
  if (window.location.pathname == "/close")
    window.close();
})();

if (Meteor.isServer) (function setupServer() {  
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
  Nominations.allow({remove: areNominationsRevocable});
  BadgeTypes.allow({
    insert: isAdminUser,
    remove: isAdminUser,
    update: isAdminUser
  });
  Meteor.methods({
    nominate: function(nomineeName, nomineeFacebookId, badgeId) {
      if (this.userId) {
        var user = Meteor.users.findOne({_id: this.userId});
        var userFacebookId = user.services.facebook.id;
        var nomination = Nominations.findOne({
          'nominator.id': userFacebookId,
          'nominee.id': nomineeFacebookId,
          badge: badgeId
        });
        if (nomination)
          return false;
        Nominations.insert({
          nominator: {
            id: userFacebookId,
            name: user.profile.name,
            isAdmin: user.isAdmin
          },
          nominee: {
            id: nomineeFacebookId,
            name: nomineeName
          },
          badge: badgeId,
          date: Date.now()
        });
        return true;
      }
    },
    refreshFriends: function() {
      if (this.userId) {
        var userId = this.userId;
        var token = Meteor.users.findOne({
          _id: this.userId
        }).services.facebook.accessToken;
        Meteor.http.call("GET", "https://graph.facebook.com/me/friends", {
          params: {
            access_token: token
          },
          timeout: 3000,
        }, function(err, result) {
          if (!err) {
            Meteor.users.update({_id: userId}, {
              $set: {friends: result.data.data}
            });
          }
        });
      }
    }
  });
  __meteor_bootstrap__.app.use(function(req, res, next) {
    var assertionRE = /^\/assertions\/([\w\-]+)$/;
    var match = req.url.match(assertionRE);
    if (match) {
      return Fiber(function() {
        var badge = Nominations.findOne({_id: match[1]});
        if (!badge) {
          res.writeHead(404);
          return res.end("assertion not found");
        }
        if (!badge.nominator.isAdmin) {
          res.writeHead(404);
          return res.end("id is a nomination from non-admin");
        }
        var user = Meteor.users.findOne({
          'services.facebook.id': badge.nominee.id
        });
        if (!user) {
          res.writeHead(404);
          return res.end("badge recipient must log in");
        }
        var badgeType = BadgeTypes.findOne({_id: badge.badge});
        var email = user.services.facebook.email;
        var salt = badge.date.toString();
        var crypto = __meteor_bootstrap__.require('crypto');
        var sum = crypto.createHash('sha256');
        sum.update(email + salt);
        var hash = 'sha256$' + sum.digest('hex');
        var assertion = {
          recipient: hash,
          salt: salt,
          badge: {
            version: "0.5.0",
            name: badgeType.name,
            image: badgeType.image,
            description: badgeType.description,
            criteria: Meteor.absoluteUrl(),
            issuer: {
              origin: Meteor.absoluteUrl().slice(0, -1),
              name: "Rockawayhelp Badges"
            }
          }
        };
        var payload = JSON.stringify(assertion, null, 2);
        res.writeHead(200, {
          'Content-Type': 'application/json'
        });
        return res.end(payload);
      }).run();
    }
    next();
  });
  Meteor.publish("rockabadge.nominations", function() {
    if (this.userId)
      return Nominations.find();
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
          'friends': 1,
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
