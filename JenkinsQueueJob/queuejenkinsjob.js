var fs = require('fs');
var path = require('path');
var shell = require('shelljs');
var chalk = require('chalk');
var request = require('request');
var commandLineArgs = require('command-line-args');
var cli = commandLineArgs([
    { name: 'url', type: String, },
    { name: 'username', type: String },
    { name: 'password', type: String },
    { name: 'parameters', type: String },
    { name: 'token', type: String },
    { name: 'jobName', type: String },
    { name: 'captureConsole', type: Boolean },
    { name: 'help', type: Boolean },
]);
if (cli.help) {
    console.log("--url           \tThe full URL of the Jenkins server");
    console.log("--username      \tThe Username.");
    console.log("--password      \tThe Password.");
    console.log("--parameters    \tList of parameters to queue the build with (PARAMETER_1=Value_1&PARAMETER_2=Value_2).");
    console.log("--token         \tJob token to queue the build with.");
    console.log("--jobName       \tThe name of the Jenkins job to queue, it must match the job name on the Jenkins server.");
    console.log("--captureConsole\tCapture the Jenkins build console output, wait for the Jenkins build to complete");
    console.log("                \tSucceed/Fail based on the Jenkins build result.");
    console.log("                \tOtherwise, once the Jenkins job is successfully queued");
    console.log("                \tthe app will successfully complete without waiting for the Jenkins build to run.");
    process.exit(0);
}
console.log('Jenkins Url=' + cli.url);
var port = cli.url.substring(cli.url.lastIndexOf(":")).replace(":", "").replace("/", "");
if (!port) {
    port = '80';
}
console.log('port=' + port);
var username = cli.username;
var password = cli.password;
var parameters = cli.parameters;
var token = cli.token;
var action = '/build';
if (token) {
    action = '/build?token=' + token;
}
if (parameters) {
    action = '/buildWithParameters?' + parameters;
}
if (parameters && token) {
    action = '/buildWithParameters?token=' + token + '&' + parameters;
}
var jobName = cli.jobName;
var jobQueueUrl = cli.url + '/job/' + jobName + action;
console.log('jobQueueUrl=' + jobQueueUrl);
var captureConsolePollInterval = 5000;
function failReturnCode(httpResponse, message) {
    var JenkinsFailureResponse = message +
        '\nHttpResponse.statusCode=' + httpResponse.statusCode +
        '\nHttpResponse.statusMessage=' + httpResponse.statusMessage +
        '\nHttpResponse=\n' + JSON.stringify(httpResponse);
    var fullMessageLog = 'JenkinsFailureResponse.log';
    fs.writeFileSync(fullMessageLog, JenkinsFailureResponse);
    var errMessage = message +
        '\nHttpResponse.statusCode=' + httpResponse.statusCode +
        '\nHttpResponse.statusMessage=' + httpResponse.statusMessage;
    console.error(chalk.red(errMessage));
}
var jenkinsTaskName;
var jenkinsExecutableNumber;
var jenkinsExecutableUrl;
var crumb;
var protocol = 'http://';
if (cli.url.indexOf("https://") >= 0) {
    protocol = 'https://';
}
function trackJobQueued(queueUri) {
    console.log('Tracking progress of job queue: ' + queueUri);
    request.get({ url: queueUri }, function callBack(err, httpResponse, body) {
        if (err) {
            console.error(chalk.red(err));
        }
        else if (httpResponse.statusCode != 200) {
            failReturnCode(httpResponse, 'Job progress tracking failed to read job queue');
        }
        else {
            var parsedBody = JSON.parse(body);
            if (parsedBody.cancelled || parsedBody.canceled) {
                console.error(chalk.red('Jenkins job canceled.'));
            }
            var executable = parsedBody.executable;
            if (!executable) {
                setTimeout(function () {
                    trackJobQueued(queueUri);
                }, captureConsolePollInterval);
            }
            else {
                jenkinsTaskName = parsedBody.task.name;
                jenkinsExecutableNumber = parsedBody.executable.number;
                if (parsedBody.executable.url.indexOf(port) >= 0) {
                    jenkinsExecutableUrl = parsedBody.executable.url;
                }
                else {
                    jenkinsExecutableUrl = parsedBody.executable.url.replace('/job', ':' + port + '/job');
                }
                console.log('Jenkins job started: ' + jenkinsExecutableUrl);
                if (cli.captureConsole) {
                    captureJenkinsConsole(0);
                }
                else {
                    console.log('Jenkins job successfully queued: ' + jenkinsExecutableUrl);
                }
            }
        }
    });
}
function captureJenkinsConsole(consoleOffset) {
    var fullUrl = protocol + username + ':' + password + '@' + jenkinsExecutableUrl.replace(protocol, "") + 'logText/progressiveText/?start=' + consoleOffset;
    console.log('full URL=' + fullUrl);
    console.log('Tracking progress of job URL: ' + fullUrl);
    request.get({ url: fullUrl }, function callBack(err, httpResponse, body) {
        if (err) {
            console.error(chalk.red(err));
        }
        else if (httpResponse.statusCode != 200) {
            failReturnCode(httpResponse, 'Job progress tracking failed to read job progress');
        }
        else {
            console.log(body);
            var xMoreData = httpResponse.headers['x-more-data'];
            if (xMoreData && xMoreData == 'true') {
                var offset = httpResponse.headers['x-text-size'];
                setTimeout(function () {
                    captureJenkinsConsole(offset);
                }, captureConsolePollInterval);
            }
            else {
                checkSuccess();
            }
        }
    });
}
function getResultString(resultCode) {
    resultCode = resultCode.toUpperCase();
    if (resultCode == 'SUCCESS') {
        return 'Success';
    }
    else if (resultCode == 'UNSTABLE') {
        return 'Unstable';
    }
    else if (resultCode == 'FAILURE') {
        return 'Failure';
    }
    else if (resultCode == 'NOT_BUILT') {
        return 'Not built';
    }
    else if (resultCode == 'ABORTED') {
        return 'Aborted';
    }
    else {
        return resultCode;
    }
}
function checkSuccess() {
    var resultUrl;
    if (jenkinsExecutableUrl.indexOf(port) >= 0) {
        resultUrl = protocol + username + ':' + password + '@' + jenkinsExecutableUrl.replace(protocol, "") + 'api/json';
    }
    else {
        resultUrl = protocol + username + ':' + password + '@' + jenkinsExecutableUrl.replace(protocol, "").replace('/job', ':' + port + '/job') + 'api/json';
    }
    resultUrl = protocol + username + ':' + password + '@' + jenkinsExecutableUrl.replace(protocol, "") + 'api/json';
    console.log('Tracking completion status of job: ' + resultUrl);
    request.get({ url: resultUrl }, function callBack(err, httpResponse, body) {
        if (err) {
            console.error(chalk.red(err));
        }
        else if (httpResponse.statusCode != 200) {
            failReturnCode(httpResponse, 'Job progress tracking failed to read job result');
        }
        else {
            var parsedBody = JSON.parse(body);
            var resultCode = parsedBody.result;
            if (resultCode) {
                resultCode = resultCode.toUpperCase();
                var resultStr = getResultString(resultCode);
                console.log(resultUrl + ' resultCode: ' + resultCode + ' resultStr: ' + resultStr);
                var completionMessage = 'Jenkins job: ' + resultCode + ' ' + jobName + ' ' + jenkinsExecutableUrl;
                if (resultCode == "SUCCESS" || resultCode == 'UNSTABLE') {
                    console.log(resultStr);
                    console.log(completionMessage);
                }
                else {
                    console.log(resultStr);
                    console.error(chalk.red(completionMessage));
                }
            }
            else {
                setTimeout(function () {
                    checkSuccess();
                }, captureConsolePollInterval);
            }
        }
    });
}
if (token) {
    console.log('requesting crumb for token:' + token);
    console.log('crumb request:' + cli.url + 'crumbIssuer/api/xml?xpath=concat(//crumbRequestField,%22:%22,//crumb)');
    request.get({ url: cli.url + "crumbIssuer/api/xml?xpath=concat(//crumbRequestField,%22:%22,//crumb)" }, function (err, httpResponse, body) {
        if (err) {
            console.log('crumb=' + crumb);
            console.error(chalk.red(err));
        }
        else if (httpResponse.statusCode != 200) {
            failReturnCode(httpResponse, 'crumb request failed.');
        }
        else {
            crumb = body.replace('Jenkins-Crumb:', '');
            console.log('crumb created:' + crumb);
            request.post({ url: jobQueueUrl, headers: { '.crumb': crumb } }, function (err, httpResponse, body) {
                if (err) {
                    console.error(chalk.red(err));
                }
                else if (httpResponse.statusCode != 201) {
                    failReturnCode(httpResponse, 'Job creation failed.');
                }
                else {
                    console.log('Jenkins job queued');
                    var queueUri = httpResponse.headers.location + 'api/json';
                    trackJobQueued(queueUri);
                }
            }).auth(username, password, true);
        }
    }).auth(username, password, true);
}
else {
    request.post({ url: protocol + username + ':' + password + '@' + jobQueueUrl.replace(protocol, "") }, function (err, httpResponse, body) {
        if (err) {
            console.error(chalk.red(err));
        }
        else if (httpResponse.statusCode != 201) {
            failReturnCode(httpResponse, 'Job creation failed.');
        }
        else {
            console.log('Jenkins job queued');
            var queueUri = httpResponse.headers.location + 'api/json';
            trackJobQueued(protocol + username + ':' + password + '@' + queueUri.replace(protocol, ""));
        }
    }).auth(username, password, true);
}
//# sourceMappingURL=queuejenkinsjob.js.map