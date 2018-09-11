const Gpio = require('onoff').Gpio
const request = require('request');
const async = require('async');
const fs = require('fs');
const path = require('path');
const PiCamera = require('pi-camera');
const connectionString = require('./config.json').connectionString;
const deviceIDMatches = connectionString.match(/DeviceId=(.*?)(;|$)/);
const DeviceClient = require('azure-iot-device').Client
const Mqtt = require('azure-iot-device-mqtt').Mqtt;
const client = DeviceClient.fromConnectionString(connectionString, Mqtt);


var pushButton = new Gpio(17, 'in', 'both');
var count = 1;
const camera = new PiCamera(
    {
        mode: 'photo',
        output: `./identify/pic${count}.jpg`,
        width: 640,
        height: 480,
        nopreview: true,
    }
)

const subscriptionKey = '';
const uri = '';
const groupid = '';
const groupname = '';


var IfAddingPerson = 0;
var IfIdentifying = 0;
var pressed = 0;

var personId2Name = function(personId){
    var personList = require('./personList.json');
    var personName = undefined;
    personList.forEach((person) => {
        if (person.id === personId){
            personName = person.name;
        }
    });
    if(personName === undefined){
        throw Error('No person with this Id!');
    }
    else{
        return personName;
    }
}

var personName2Id = function(personName){
    var personList = require('./personList.json');
    var personId = undefined;
    personList.forEach((person) => {
        if (person.name === personName){
            personId = person.id;
        }
    });
    if(personId === undefined){
        throw Error('No person with this Id!');
    }
    else{
        return personId;
    }
}

var createGroup =  function(groupid, groupname){
    const options_create = {
        uri: uri + 'persongroups/' + groupid,
        body: '{"name": ' + '"' + groupname + '"}',
        headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key' : subscriptionKey
        }
    };
    
    return new Promise( (resolve, reject) => {
        request.put(options_create, (error, response, body) => {
            if (error) {
                reject(err);
                return;
            } else{
                resolve(groupid);
                return;
            }
        });
    });
}

var createPerson =  function(personName, groupid){  
    const options_create_person = {
        uri: uri + 'persongroups/' + groupid + "/persons",
        body: '{"name": ' + '"' + personName + '"}',
        headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key' : subscriptionKey
        }
    };
    
    return new Promise ((resolve, reject) => {
        request.post(options_create_person, (error, response, body) => {
            if (JSON.parse(body).error) {
                reject(JSON.parse(body).error);
                return;
            }else{
                var personId = JSON.parse(body).personId;          
                var personList = require('./personList.json');
                personList.push({name : personName, id: personId});
                fs.writeFileSync('./personList.json', JSON.stringify(personList, null, 2));
                console.log(`Add person ${personName} succeed!`);
                resolve([groupid, personId]);
                return;
            }
        });
    });
}

var listPersonalGroup =  function (groupid){
    const options_list = {
        uri: uri + 'persongroups/' + groupid + "/persons",
        headers: {
            'Ocp-Apim-Subscription-Key' : subscriptionKey
        }
    };

    request.get(options_list, (error, response, body) => {
        if (error) {
          console.log('Error: ', error);
          return;
        }
        let jsonResponse = JSON.stringify(JSON.parse(body), null, '  ');
        console.log('JSON Response\n');
        console.log(jsonResponse);
    });   
}

var addFacesDir = function(groupid, personId, Dir){
    const files = fs.readdirSync(Dir);
    var options_list_face_add;
    var finished = 0;
    files.forEach( (file) => {
        var filename = path.join(Dir, file);
        if (filename.indexOf('jpg') >= 0){
            fs.readFile(filename, (err, data) => {
                if (err){
                    throw err;
                }
                else{
                    console.log(filename);
                    options_list_face_add = {
                        uri: uri + 'persongroups/' + groupid + '/persons/' + personId + '/persistedFaces',
                        body: data,
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            'Ocp-Apim-Subscription-Key' : subscriptionKey
                        }
                    };
                    request.post(options_list_face_add, (error, response, body) => {
                        if (JSON.parse(body).error) {
                            console.log(JSON.parse(body));
                            finished += 1;
                        }else{
                            console.log(`Add face to person ${personId2Name(personId)} succeed`);
                            finished += 1;
                        }
                    });
                }   
            })
        }
    })
    return new Promise((resolve, reject) => {
        var check = setInterval(() => {
            if (finished === 5){
                clearInterval(check);
                resolve(groupid);
            }
        }, 200)
    })
}

var train = function(groupid){
    var trained = 0;
    const options_train = {
        uri: uri + 'persongroups/' + groupid + '/train',
        headers: {
            'Ocp-Apim-Subscription-Key' : subscriptionKey
        }
    };
    request.post(options_train, (error, response, body) => {
        if (error) {
            console.log('Train error: ', error);
            return;
        }
        else{
            console.log('Start training');
            var status = null;
            var checking = setInterval(() => {
                const options_training = {
                    uri: uri + 'persongroups/' + groupid + '/training',
                    headers: {
                        'Ocp-Apim-Subscription-Key' : subscriptionKey
                    }
                };

                request.get(options_training, (error, response, body) => {
                    if (error) {
                        console.log('Train error: ', error);
                        return;
                    }
                    else{
                        status = JSON.parse(body).status;
                        console.log(status)
                        if (status === 'succeeded'){
                            console.log('Train succeed');
                            trained = 1;
                            clearInterval(checking);
                        }
                    }
                });
            }, 2000);
        }
    });
    return new Promise((resolve, reject) => {
        var training = setInterval(() => {
            if (trained === 1){
                clearInterval(training);
                resolve(groupid);
            }
        }, 2000)
    })
}

var identifyImage = function(imageLocalPath, groupid){
    var personId = null;
    IfIdentifying = 1;
    if (imageLocalPath.indexOf('jpg') >= 0){
        fs.readFile(imageLocalPath, function(err, data) {
            if (err){
                throw err;
            }
            else{
                var options_list_detect = {
                    uri: uri + 'detect',
                    body: data,
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Ocp-Apim-Subscription-Key' : subscriptionKey
                    }
                };  
                request.post(options_list_detect, (error, response, body) => {
                    if (error) {
                        console.log('Detect error: ', error);
                        return;
                    }
                    else{
                        if (JSON.parse(body)[0] !== undefined){
                            var faceId = JSON.parse(body)[0].faceId;
                            var options_list_identify = {
                                uri: uri + 'identify',
                                body: '{"personGroupId": ' + '"' + groupid + '",' + 
                                '"faceIds": [' + '"' + faceId + '"' + '],' + 
                                '"maxNumOfCandidatesReturned": 1,' +
                                '"confidenceThreshold": 0.5' +
                                '}',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Ocp-Apim-Subscription-Key' : subscriptionKey
                                }
                            };
                            request.post(options_list_identify, (error, response, body) => {
                                if (error) {
                                    console.log('Identify error: ', error);
                                    IfIdentifying = 0;
                                    return;
                                }
                                else{
                                    if (JSON.parse(body)[0].candidates[0] === undefined){
                                        console.log('Not allowed!');
                                        IfIdentifying = 0;
                                        //denyEntry();
                                    }else{
                                        personId = JSON.parse(body)[0].candidates[0].personId;
                                        console.log(`Find Person ${personId2Name(personId)}`)
                                        IfIdentifying = 0;
                                        //allowEntry(personId2Name(personId));
                                    }
                                }
                            });
                        }
                        else{
                            console.log('Not allowed!');
                            IfIdentifying = 0;
                        }

                    }
                });
            }
        });
    }
    else{
        throw Error('Not JPG Format Image');
    }
}

var deletePerson = function(personName, groupid){
    var personId = personName2Id(personName);
    const options_delete_person = {
        uri: uri + 'persongroups/' + groupid + "/persons/" + personId,
        headers: {
            'Ocp-Apim-Subscription-Key' : subscriptionKey
        }
    };
    request.delete(options_delete_person, (error, response, body) => {
        if (error) {
          console.log('Error: ', error);
          return;
        }else{
            console.log(`Delete person ${personName} succeed`);
        }
    });   
}

var deleteGroup = function(groupid){
    const options_delete_group = {
        uri: uri + 'persongroups/' + groupid,
        headers: {
            'Ocp-Apim-Subscription-Key' : subscriptionKey
        }
    };
    request.delete(options_delete_group, (error, response, body) => {
        if (error) {
          console.log('Error: ', error);
          return;
        }
        else{
            console.log(`Delete Group with id ${groupid} succeed`);
        }
    });   
}

var AddPerson = function(personName, groupid){
    var added = 0;
    var dirPath = `./Data/PersonGroup/${personName}`;
    var pictureCount = 1;
    IfAddingPerson = 1;
    if (!fs.existsSync(dirPath)){
        fs.mkdirSync(dirPath);
    }
    console.log('Please push the button 5 times to take 5 photos.');
    console.log(`Picture ${pictureCount}`);
    camera.set('output', `${dirPath}/${personName}${pictureCount}.jpg`);
    pushButton.watch(function(err, value) {
        if (err){
            console.error('Error', err);
            return;
        }
        if (value === 1 && pressed === 0){
            pressed = 1;
            console.log('Button is pressed.');
            camera.snap()
            .then((result) => {
                console.log(`Picture saved at ${camera.get('output')}`);
                pictureCount += 1
                if (pictureCount !== 6){
                    console.log(`Picture ${pictureCount}`);
                }
                camera.set('output', `${dirPath}/${personName}${pictureCount}.jpg`);
            })
            .catch((error) => {
                console.log(error);
            })
        }
        if (value === 0){
            pressed = 0;
        }
    })

    return new Promise((resolve, reject) => {
        var check = setInterval(() => {
            if (pictureCount === 6){
                pushButton.unwatch();
                clearInterval(check);  
                createPerson(personName, groupid).then(IDs => {
                    addFacesDir(IDs[0], IDs[1], dirPath).then(groupid => {
                        train(groupid).then(() => {
                            IfAddingPerson = 0;
                            resolve(groupid);
                        });
                    })
                }
                ).catch(err => {
                    console.log(err);
                    IfAddingPerson = 0;
                })
            }
        }, 200);
    })
}

var loop = async function(groupid){
    client.open(function (err) {
        if (err) {
        console.error(err.toString());
        }
        else {
            console.log('client successfully connected');
            client.on('error', function (err) {
                console.error(err.toString());
            });
            client.onDeviceMethod('Add', function (request, response) {
                var Newname = request.payload.Name;
                console.log(`Add person ${Newname}`);
                pushButton.unwatch();
                AddPerson(Newname, groupid)
                .then(() => { 
                    response.send(200, "Adding person successfully", function (err) {
                        if (err) {
                            console.error('Unable to send method response: ' + err.toString());
                        } else {
                            console.log('response to method sent.');
                        }
                    });
                    pushButton.watch(function(err, value) {
                        if (err){
                            console.error('Error', err);
                            return;
                        }
                        if (value === 1 && pressed === 0){
                            pressed = 1;
                            console.log('Button is pressed');
                            if (IfIdentifying === 0 && IfAddingPerson === 0){
                                camera.set('output', `./identify/pic${count}.jpg`);
                                console.log('Start taking photos');
                                camera.snap()
                                .then((result) => {
                                    count += 1;
                                    console.log(`Identify picture saved at ${camera.get('output')}`);
                                    identifyImage(`${camera.get('output')}`, groupid);
                                    camera.set('output', `./identify/pic${count}.jpg`);
                                })
                                .catch((error) => {
                                    console.log(error);
                                })
                            }
                        }
                        if (value === 0){
                            pressed = 0;
                        }
                    })
                })
            })
            client.onDeviceMethod('Delete', function (request, response) {
                var Deletename = request.payload.Name;
                console.log(`Delete person ${Deletename}`);
                deletePerson(Deletename, groupid);
                response.send(200, "Delete person successfully", function (err) {
                    if (err) {
                        console.error('Unable to send method response: ' + err.toString());
                    } else {
                        console.log('response to method sent.');
                    }
                });
            })
            client.onDeviceMethod('List', function(request, response) {
                responseStr = "";
                var personList = require('./personList.json');
                personList.forEach((person) => {
                    responseStr = responseStr + " " + person.name;
                });
                response.send(200, responseStr, function (err) {
                    if (err) {
                        console.error('Unable to send method response: ' + err.toString());
                    } else {
                        console.log('response to method sent.');
                    }
                });
            })
        }
    });
    pushButton.watch(function(err, value) {
        if (err){
            console.error('Error', err);
            return;
        }
        if (value === 1 && pressed === 0){
            pressed = 1;
            console.log('Button is pressed');
            if (IfIdentifying === 0 && IfAddingPerson === 0){
                console.log('Start taking photos');
                camera.snap()
                .then((result) => {
                    count += 1;
                    camera.set('output', `./identify/pic${count}.jpg`);
                    console.log(`Identify picture saved at ${camera.get('output')}`);
                    identifyImage(`${camera.get('output')}`, groupid);
                    camera.set('output', `./identify/pic${count}.jpg`);
                })
                .catch((error) => {
                    console.log(error);
                })
            }
        }
        if (value === 0){
            pressed = 0;
        }
    })

}

var detectGroup = function(groupid){
    const options_detect_group = {
        uri: uri + 'persongroups/' + groupid,
        headers: {
            'Ocp-Apim-Subscription-Key' : subscriptionKey
        }
    };
    return new Promise((resolve, reject) => {
        request.get(options_detect_group, (error, response, body) => {
            if (error) {
                reject(error)
            }else{
                if (JSON.parse(body).error === undefined){   
                    console.log('Person group exists!')
                    resolve(false);
                }else{
                    console.log('Creating person group...')
                    resolve(true);
                }
            }
        });  
    })
    
}
var init = function(groupid, groupname){
    function unexportOnClose(){
        pushButton.unexport();
    }
       
    if (!fs.existsSync('./identify')){
        fs.mkdirSync('./identify');
    }
    if (!fs.existsSync('./Data')){
        fs.mkdirSync('./Data');
    }
    if (!fs.existsSync('./Data/PersonGroup')){
        fs.mkdirSync('./Data/PersonGroup');
    }
    process.on('SIGINT', unexportOnClose);
    return new Promise((resolve, reject) => {
        detectGroup(groupid)
        .then(ifCreate => {
            if (ifCreate){
                createGroup(groupid, groupname)
                .then(groupid => resolve(groupid))
                .catch(err => console.log(err));
            }else{
                resolve(groupid);
            }
        })
        .catch(err => console.log(err));
    })
}

init(groupid, groupname)
.then(groupid => loop(groupid))
.catch(err => console.log(err))
