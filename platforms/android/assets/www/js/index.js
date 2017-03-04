/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
var app = {
    // Application Constructor
    initialize: function() {
        this.bindEvents();
    },
    // Bind Event Listeners
    //
    // Bind any events that are required on startup. Common events are:
    // 'load', 'deviceready', 'offline', and 'online'.
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
        $('.actionbar').click(function(e) {
          e.preventDefault();
          var $el = $(e.target),
              attr = $el.attr('data-ru');

          if (attr != undefined) {
            var namespaces = attr.split(".");
            var func = namespaces.pop();
            var context = app;
            for(var i = 0; i < namespaces.length; i++) {
              context = context[namespaces[i]];
            }
            context[func].apply(context);
          }
        });
        app.firebase.setupFirebase();
        app.auth.check();
    },
    // deviceready Event Handler
    //
    // The scope of 'this' is the event. In order to call the 'receivedEvent'
    // function, we must explicitly call 'app.receivedEvent(...);'
    onDeviceReady: function() {
        console.log('Received Device Ready Event');
        window.plugins.PushbotsPlugin.initialize("58baf2b94a9efaf9358b456a", {"android":{"sender_id":"235598502795"}});
        // Should be called once app receive the notification only while the application is open or in background
        // window.plugins.PushbotsPlugin.on("notification:received", function(data){
        //   console.log("received:" + JSON.stringify(data));
          
        //   //Silent notifications Only [iOS only]
        //   //Send CompletionHandler signal with PushBots notification Id
        //   window.PushbotsPlugin.done(data.pb_n_id);
        // });

        // // Should be called once the device is registered successfully with Apple or Google servers
        // window.plugins.PushbotsPlugin.on("registered", function(token){
        //   console.log('token', token);
        // });

        // //Get device token
        // window.plugins.PushbotsPlugin.getRegistrationId(function(token){
        //     console.log("Registration Id:" + token);
        // });

        app.map.initialize();
        app.setupPush();
    },
    setupPush: function() {
        console.log('calling push init');
        var push = PushNotification.init({
            "android": {
                "senderID": "XXXXXXXX"
            },
            "browser": {},
            "ios": {
                "sound": true,
                "vibration": true,
                "badge": true
            },
            "windows": {}
        });
        console.log('after init');

        push.on('registration', function(data) {
            console.log('registration event: ' + data.registrationId);

            var oldRegId = localStorage.getItem('registrationId');
            if (oldRegId !== data.registrationId) {
                // Save new registration ID
                localStorage.setItem('registrationId', data.registrationId);
                // Post registrationId to your app server as the value has changed
            }

            var parentElement = document.getElementById('registration');
            var listeningElement = parentElement.querySelector('.waiting');
            var receivedElement = parentElement.querySelector('.received');

            listeningElement.setAttribute('style', 'display:none;');
            receivedElement.setAttribute('style', 'display:block;');
        });

        push.on('error', function(e) {
            console.log("push error = " + e.message);
        });

        push.on('notification', function(data) {
            console.log('notification event');
            navigator.notification.alert(
                data.message,         // message
                null,                 // callback
                data.title,           // title
                'Ok'                  // buttonName
            );
       });
    },
    push: {
      showDriverRequest: function(data) {
        navigator.notification.confirm(
            'Requesting pick up from ' + data.search_location,                                               // message
            function(choice) { app.events.handleDriverResponse(data, choice) },                   // callback
            data.passanger + ' is requesting a ride',                                                 // title
            ['Confirm', 'Reject']                                                                     // buttonName
        );
      },
      showRiderRequest: function(data) {
        navigator.notification.alert(
            'Ride Request',                                      // message
            null,                                               // callback
            data.driver + ' has been notified',                 // title
            'Ok'                                                // buttonName
        );
      }
    },
    events: {
      requestRide: function(data) {
        var rider_data = $.extend({
          type: 'passanger',
          confirmed: false
        }, data);

        var driver_data = $.extend({
          type: 'driver',
          passanger: app.auth.user.user_name
        }, data);

        console.log('Requsting Ride', driver_data);
        console.log('Rider record', rider_data);

        app.firebase.incrementId(function() {
          app.firebase.pushRiderRequest(rider_data, function() {
            // app.auth.setWaitingUI(rider_data.driver);
            app.firebase.pushDriverRequest(driver_data, function() {
              console.log('user data for passanger pending', rider_data);
              app.auth.user.active_request = rider_data;
              app.firebase.setUserStatus('passanger_pending');
            });
          });
        });
      },
      listenForRequests: function() {
        app.firebase.newRequest(function(request) {
          console.log('new request?', request);

          switch(request.type) {
            case 'driver':
              app.push.showDriverRequest(request);
              break;
            case 'passanger':
              app.push.showRiderRequest(request);
              break;
          }
        });

        app.firebase.deletedRequest(function(request) {
          console.log('deleted request?', request);
        });

        app.firebase.changedRequest(function(request) {
          console.log('changed request?', request);
          if (request.confirmed == true) {
            app.firebase.deleteRequest(request);
            app.firebase.newTrip(request);
          } else if (request.confirmed = 'rejected') {
            app.firebase.deleteRequest(request);
            app.firebase.setUserStatus('free');
            app.modal.showMessage(request.driver + ' rejected your trip request');
          }
        });
      },
      removeListenRequest: function() {
        app.firebase.stopRequests();
        app.firebase.stopTrips();
      },
      handleDriverResponse: function(request, response) {
        console.log('Driver response is', response);
        if (response == 1) {
          app.events.notifyConfirmed(request);
        } else if (response == 2) {
          app.events.notifyRejected(request);
        } else {
          location.reload();
        }
      },
      statusChange: function() {
          app.firebase.db.ref('users/' + app.auth.user.user_name + '/status').on('value', function(snapshot) {
            var status = snapshot.val();
            console.log('user status change:', status);
            app.ui.update(status);
            app.auth.user.status = status;
          });
      },
      notifyConfirmed: function(request) {
        app.firebase.notifyConfirmed(request);
      },
      notifyRejected: function(request) {
        app.firebase.notifyRejected(request);
      },
      listenForTrips: function() {
        app.firebase.db.ref('trips/').on('child_added', function(snapshot) {
          var trip = app.auth.user.active_trip = $.extend({}, snapshot.val(), { key: snapshot.key });

          console.log('new trip added', trip);
          // callback($.extend({}, snapshot.val(), {key: snapshot.key }));
          switch(app.auth.user.user_name) {
            case trip.driver: 
              console.log('events.listenForTrips: starting new trip as driver');
              app.firebase.setUserStatus('driver_confirmed');
              watchTrip();
              break;
            case trip.passanger: 
              console.log('events.listenForTrips: starting new trip as passanger');
              app.firebase.setUserStatus('passanger_confirmed');
              watchTrip();
              break;
            default:
              break;
          }
        });

        function watchTrip() {
          console.log('new trip', app.auth.user.active_trip);
          app.firebase.db.ref('trips/' + app.auth.user.active_trip.key).on('child_removed', function() {
            app.firebase.setUserStatus('free');
            app.map.otherMarker.setMap(null);
            app.map.marker.setMap(null);
            app.map.destMarker.setMap(null);
            app.map.centerOnUser();
            app.firebase.db.ref('trips/' + app.auth.user.active_trip.key).off();
          });
        }
      },
      cancelTrip: function() {
        app.firebase.cancelTrip();
        app.auth.user.active_trip = undefined;
      }
    },
    firebase: {
      setupFirebase: function () {
        var database = app.firebase.db = firebase.database();
      },
      get: function(thing_type, id, callback) {
        app.firebase.db.ref('/' + thing_type + '/' + id).once('value').then(function(snapshot) {
          callback(snapshot.val());
        });
      },
      getAllFreeUsers: function(callback) {
        app.firebase.db.ref('/users/').once('value').then(function(snapshot) {
          var users = snapshot.val();

          delete users[app.auth.user.user_name];

          $.each(users, function(idx, user) {
            user.status != 'free' && users.splice(idx, 1);
          });

          callback(users);
        });
      },
      requests: function(callback) {
        app.firebase.db.ref('/requests/' + app.auth.user.user_name).on('value', function(snapshot) {
          callback(snapshot.val());
        });
      },
      newRequest: function(callback) {
        app.firebase.db.ref('/requests/' + app.auth.user.user_name).on('child_added', function(snapshot) {
            console.log(snapshot, snapshot.key);
            callback($.extend({}, snapshot.val(), {key: snapshot.key })); 
        });
      },
      deleteRequest: function(request) { 
        app.firebase.db.ref('requests/' + request.driver).remove()
          .then(function() {
            console.log('removed', request.driver, ' request from db');
            app.firebase.db.ref('requests/' + app.auth.user.user_name).remove()
              .then(function(){
                console.log('removed', app.auth.user.user_name, 'from db');
              });
          });
      },
      deletedRequest: function(callback) {
        app.firebase.db.ref('/requests/' + app.auth.user.user_name).on('child_removed', function(snapshot) {
          callback(snapshot.val());
        });
      },
      changedRequest: function(callback) {
        app.firebase.db.ref('/requests/' + app.auth.user.user_name).on('child_changed', function(snapshot) {
          callback($.extend({}, snapshot.val(), { key: snapshot.key }))
        });
      },
      pushRiderRequest: function(data, callback) {
        console.log('pushRiderRequest start');
        app.firebase.getCurrentId(function(id) {
          app.firebase.set('requests', app.auth.user.user_name + '/' + id, data, callback);
        })
      },
      pushDriverRequest: function(data, callback) {
        app.firebase.getCurrentId(function(id) {
          app.firebase.set('requests', data.driver + '/' + id, data, callback);
        });
      },
      stopRequests: function() {
        app.firebase.db.ref('/requests/' + app.auth.user.user_name).off();
      },
      stopTrips: function() {
        app.firebase.db.ref('/trips').off();
      },
      set: function(thing_type, id, data, callback) {
         app.firebase.db.ref('/' + thing_type + '/' + id).set(data)
          .then(function() {
            console.log('Synchronization succeeded');
            callback && callback();
          })
          .catch(function(error) {
            console.log('Synchronization failed', error);
          });
      },
      getCurrentId: function(callback) {
        app.firebase.db.ref('/requests/_counter').once('value').then(function(snapshot) {
          callback(parseInt(snapshot.val()));
        });
      },
      incrementId: function(callback) {
        app.firebase.getCurrentId(function(id) {
          app.firebase.set('requests', '_counter', id+1, callback);
        });
      },
      getUser: function(callback, name) {
        app.firebase.get('users', name || app.auth.user.user_name, callback);
      },
      setUserStatus: function(type) {
        console.log('setting users status', type);
        app.firebase.db.ref('/users/' + app.auth.user.user_name).update({status: type || 'busy'});
      },
      notifyConfirmed: function(request) {
        app.firebase.db.ref('/requests/' + request.passanger + '/' + request.key).update({confirmed: true}); 
      },
      notifyRejected: function(request) {
        app.firebase.db.ref('/requests/' + request.passanger + '/' + request.key).update({confirmed: 'rejected'}); 
      },
      updateUserCoordinates: function(coordinates) {
        app.firebase.db.ref('/users/' + app.auth.user.user_name).update(coordinates);
      },
      newTrip: function(request) {
        app.firebase.set('trips', request.key, {
          passanger: app.auth.user.user_name, 
          driver: request.driver,
          location: request.location
        });;
      },
      cancelTrip: function(trip) {
        app.firebase.db.ref('trips/' + app.auth.user.active_trip.key).remove();
      }
    },
    auth: {
      login: function () {
        console.log('auth.login called');

        firebase.auth().signInAnonymously().catch(function(error) {
          // Handle Errors here.
          var errorCode = error.code;
          var errorMessage = error.message;
          
          console.log('ERROR', error);
        });
      },
      logout: function() {
        app.events.removeListenRequest();
        localStorage.removeItem('user.displayName');
        location.reload();  
      },
      check: function() {
        firebase.auth().onAuthStateChanged(function(user) {
          if (user) {
            // User is signed in.
            console.log('auth.check: user signed in');

            var displayName = user.user_name = localStorage.getItem('user.displayName');

            if (displayName === null) {
              console.log('no displayName');

              var displayName = user.user_name = prompt('Enter your Name');
              localStorage.setItem('user.displayName', displayName);
            }

            app.auth.user = user;

            app.auth.createOrUpdateUser(function() {
              app.events.listenForRequests();
              app.events.listenForTrips();
              app.events.statusChange()
            });
            // app.auth.setLoggedInUI();
          } else {
            app.ui.update();
          }
        });
      },
      createOrUpdateUser: function(callback) {
        var userInfo = {
          status: 'free'
        }

        app.firebase.get('users', app.auth.user.user_name, function(user) {
          if (user) {
            console.log('user exists in db', user);
            callback();
          } else {
            console.log('user missing in db, creating', user);
            app.firebase.set('users', app.auth.user.user_name, userInfo, function(user) {
              console.log('user created: ', user);
              callback();
            });
          }
        });

      }
    },
    ui: {
      update: function(status) {
        var ui = app.ui;

        switch(status) {
          case 'free':
            console.log('ui.update: free');
            ui.setLoggedIn();
            break;
          case 'passanger_pending':
            console.log('ui.update: passanger_pending');
            ui.setWaiting();
            break;
          case 'passanger_confirmed':
            console.log('ui.update: passanger_confirmed');
            ui.confirmedPassanger();
            app.map.showBoth();
            break;
          case 'driver_confirmed':
            console.log('ui.update: driver_confirmed');
            ui.confirmedDriver();
            app.map.showBoth();
            break;
          default:
            console.log('ui.update: default (logged out)')
            ui.setLoggedOut();
        }
      },
      showActionBar: function() {
        $('.logged-in').show();
      },
      setLoggedIn: function() {
        var available = $('.available');
        $('.logged-out').hide();
        $('.logged-in').children().hide();
        available.html(available.html().replace(/\$\{currentUser\}/, app.auth.user.user_name));
        available.show();
      },
      setWaiting: function() {
        var $waiting = $('.waiting');
        $('.logged-in').children().hide();
        $waiting.html($waiting.html().replace(/\$\{driver\}/, app.auth.user.active_request.driver));
        $waiting.show();
      },
      confirmedPassanger: function() {
        var $confirmed = $('.confirmed');
        $('.logged-in').children().hide();
        console.log('confirmedPassanger ---:', app.auth.user.active_trip);
        $confirmed.html($confirmed.html().replace(/\$\{driver\}/, app.auth.user.active_trip.driver));
        $confirmed.show();
      },
      confirmedDriver: function() {
        var $confirmed = $('.driver-confirmed');
        $('.logged-in').children().hide();
        $confirmed.html($confirmed.html().replace(/\$\{passanger\}/, app.auth.user.active_trip.passanger));
        $confirmed.show();
      },
      setLoggedOut: function() {
        $('.logged-in').hide();
        $('.logged-out').show();
      },
    },
    modal: {
      requestRide: function() {
        app.firebase.getUser(function(user) {
          if (user.status == 'busy') {
            $('<div class="message-modal">You\'ve already requested a ride</div>').appendTo(document.body);
          } else {
            console.log('requesting ride form');
            var $rideContainer = $('.request-ride-modal').clone().toggle().appendTo(document.body),
                $search_location = $rideContainer.find('.search_location'),
                autocomplete = new google.maps.places.Autocomplete($search_location[0], {types: ['geocode']});


            autocomplete.addListener('place_changed', function() {
              var place = autocomplete.getPlace();
              $rideContainer.find('input[name="location"]').val(place.geometry.location.lat() + ',' + place.geometry.location.lng());
            });

            $rideContainer.find('.recent-locations input').click(function() {
              $search_location.val($(this).val());
              $search_location.focus();
            });

            app.firebase.getAllFreeUsers(function(users) {
              var listHtml = '';
              $.each(users, function(idx, user) {
                listHtml += ('<input type="radio" name="driver" value="' + idx + '" id="' + idx + '" required><label for="' + idx + '">' + idx + '</label></li>');
              });
              $rideContainer.find('.driver-list').append(listHtml);
              // TODO: Previus Locations

              $rideContainer.find('#request-ride').on('submit', function(e) {
                e.preventDefault();
                var data = $(this).serializeArray();
                data = app.utils.sanitizeRequest(data);

                app.events.requestRide(data);
                closeModal();
              });
            });

            $rideContainer.find('.close-modal').click(closeModal);
            
            function closeModal() {
              $rideContainer.remove();
            }
          }
        });
      },
      showMessage: function(msg) {
        var $msgModal = $('.message-modal').clone();

        $msgModal.find('.close-modal').click(function() {
          $msgModal.remove();
        });

        $msgModal.prepend(msg).toggle().appendTo(document.body);
      }
    },
    utils: {
      sanitizeRequest: function(data) {
        var allowed_vals = ["location", "driver", "search_location"],
            final_data = {}
        $.each(data, function(idx, val) {
          if (allowed_vals.indexOf(val.name) > -1) {
            final_data[val.name] = val.value;
          }
        });
        return final_data;
      }
    },
    map: {
      initialize: function() {
        navigator.geolocation.getCurrentPosition(function(position) {
          var pos = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
          }

          var map = app.map.object = new google.maps.Map(document.getElementById('map'), {
            center: pos,
            zoom: 15
          });

          var marker = app.map.marker = new google.maps.Marker({
              position: pos,
              map: map,
              icon: 'http://maps.google.com/mapfiles/kml/pal3/icon28.png'
          });
        }, function(error) {
          console.log('An error occurred with getCurrentPosition', arguments);
        }, {timeout:10000});

        (function updateMap() {
          setTimeout(function() {
            app.map.getCurrentPosition(function(position) {
              var oldCoords = localStorage.getItem('user.coordinates');

              if (oldCoords) (oldCoords = JSON.parse(oldCoords));
              
              if (!oldCoords || (position.coords.latitude != oldCoords.latitude) || (position.coords.longitude != oldCoords.longitude)) {
                app.firebase.updateUserCoordinates({latitude: position.coords.latitude, longitude: position.coords.longitude});
                console.log('storing coordinates', position);
                localStorage.setItem('user.coordinates', JSON.stringify({latitude: position.coords.latitude, longitude: position.coords.longitude}));
                $('.myPos').addClass('changed').text(position.coords.latitude + ', ' + position.coords.longitude);
                app.map.marker.setPosition(new google.maps.LatLng(position.coords.latitude, position.coords.longitude));
              } else {
                $('.myPos').removeClass('changed').text(position.coords.latitude + ', ' + position.coords.longitude);
              }
            })
            updateMap();
          }, 5000);
        })();
      },
      getCurrentPosition: function(callback) {
        navigator.geolocation.getCurrentPosition(callback);
      },
      centerOnUser: function() {
        app.map.getCurrentPosition(function(position) {
          var pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          app.map.marker.setPosition(pos);
          app.map.marker.setMap(app.map.object);
          app.map.marker.setIcon('http://maps.google.com/mapfiles/kml/pal3/icon28.png');

          app.map.object.setCenter(pos);
          app.map.object.setZoom(15);
        });
      },
      showBoth: function() {
        var bounds = new google.maps.LatLngBounds();
        app.map.getCurrentPosition(function(position) {
          console.log('my coords', {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          bounds.extend({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          app.map.getUserPosition(function(otherUserPos) {
            console.log('other users coords', otherUserPos);
            var otherMarker = app.map.otherMarker = new google.maps.Marker({
              position: otherUserPos,
              map: app.map.object
            });

            bounds.extend(otherUserPos);

            var dest = app.auth.user.active_trip.location.split(',');
            dest = { lat: parseFloat(dest[0]), lng: parseFloat(dest[1]) },
            console.log('dest coords marker', dest, typeof dest['lat'], typeof dest['lng']);
            destMarker = app.map.destMarker = new google.maps.Marker({
              position: dest,
              map: app.map.object,
              icon: 'http://maps.google.com/mapfiles/kml/pal2/icon13.png'
            });

            bounds.extend(dest);

            (app.auth.user.status == 'passanger_confirmed' ? otherMarker : app.map.marker).setIcon('http://i66.tinypic.com/s4t4yp.png');
            (app.auth.user.status == 'passanger_confirmed' ? app.map.marker : otherMarker).setIcon('http://maps.google.com/mapfiles/kml/pal3/icon28.png');

            app.map.object.fitBounds(bounds);
          });
        });
      },
      getUserPosition: function(callback) {
        var trip = app.auth.user.active_trip,
            user = app.auth.user;

        app.firebase.getUser(function(userData) {
          var pos = {
            lat: userData.latitude,
            lng: userData.longitude
          }
          callback(pos);
        }, user.status == 'passanger_confirmed' ? trip.driver : trip.passanger);
      }
    }
};
