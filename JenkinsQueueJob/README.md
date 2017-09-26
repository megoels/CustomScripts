# Queue Jenkins Job #

## How it works ##
1. Install Node: [https://nodejs.org/en/](https://nodejs.org/en/)
2. Make sure to configure the npm 
  a. update the registry permanently in the config
      npm config set registry http://registry.npmjs.org 
  b. if you are behind proxy do:
      npm config set proxy "http://<proxy server>:<port>" 
      npm config set https-proxy "https://<proxy server>:<port>" 
3. Run the command "npm i" (run it on the scripts folder "JenkinsQueueJob", this command will create folder named "node_modules").
4. Run the script with the node tool for example: "C:\Program Files\nodejs\node.exe" queuejenkinsjob.js --help

**Notes:**

Make sure to send parameters if needed (unless you will get error like "Nothing is submitted")

node queuejenkinsjob.js --url <Jenkins URL> --username <Username> --password <Password> --jobName <Job Name> --parameters=PARAMETER_1=Value_1&PARAMETER_2=Value_2
