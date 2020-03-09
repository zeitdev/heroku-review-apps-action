import * as core from '@actions/core';
import * as github from '@actions/github';
import {HerokuPlatformApiApp, HerokuPlatformApiConfigVars} from '@heroku-cli/typescript-api-schema';
import * as fs from 'fs';
import {each, mapValues} from 'lodash-es';
import {AppJson, AppJsonAddon, AppJsonEnv} from './lib/heroku';
import Heroku = require('heroku-client');

async function createAddons(heroku: Heroku, targetApp: string, addons: Array<AppJsonAddon | string>) {
  return await Promise.all(addons.map(async(addon: AppJsonAddon | string) => {
    const newAddon = typeof addon === 'string'
      ? {plan: addon}
      : {
        plan: addon.plan,
        config: addon.options,
        attachment: addon.as && {
          name: addon.as,
        },
      };
    console.log(`Creating addon ${newAddon.plan}...`);
    const response = await heroku.post(`/apps/${targetApp}/addons`, {body: newAddon});
    console.log(response);

  }));
}

async function addEnvs(
  heroku: Heroku,
  sourceApp: string,
  targetApp: string,
  envs: Record<string, AppJsonEnv>,
  additional?: HerokuPlatformApiConfigVars,
) {
  const sourceEnvs = await heroku.get<HerokuPlatformApiConfigVars>(`/apps/${sourceApp}/config-vars`);

  const targetEnvs = mapValues(envs, (envDef, key) => {
    if (envDef.generator) {
      throw 'ENVs with generator not supported atm.';
    }

    const value = envDef.value || sourceEnvs[key];

    if (envDef.required && !value) {
      throw `Missing required env ${key}`;
    }

    return value;
  });

  if (additional) {
    each(additional, (val, key) => {
      if (val) targetEnvs[key] = val;
    });
  }

  console.log(`Adding ENVs to ${targetApp}...`);
  return await heroku.patch(`/apps/${targetApp}/config-vars`, {body: targetEnvs});
}

async function createApp(
  heroku: Heroku,
  appName: string,
  sourceApp: HerokuPlatformApiApp,
  pipelineId: string,
  pipelineStage: string,
  appJson: AppJson,
  additionalEnvs: HerokuPlatformApiConfigVars,
) {
  const newAppRequest = {
    name: appName,
    region: sourceApp.region?.name,
    stack: sourceApp.stack?.name,
    team: sourceApp.team?.name,
  };
  console.log(`Creating new app ${appName}...`);
  const createPath = newAppRequest.team ? '/teams/apps' : '/apps';
  const newApp = await heroku.post<HerokuPlatformApiApp>(createPath, {body: newAppRequest});
  console.log('Created App.', newApp.id);

  try{
    const pipelineCoupling = {
      app: appName,
      pipeline: pipelineId,
      stage: pipelineStage,
    };
    console.log(`Putting ${appName} in pipeline ${pipelineId}, stage ${pipelineStage}...`);
    await heroku.post('/pipeline-couplings', {body: pipelineCoupling});

    await createAddons(heroku, appName, appJson.addons);
    await addEnvs(heroku, sourceApp.name!, appName, appJson.env, additionalEnvs);
  } catch (e) {
    await heroku.delete(`/apps/${appName}`);
    throw e;
  }

  return newApp;
}

async function run() {
  const appName = core.getInput('app');
  const envFrom = core.getInput('env_from');
  const pipelineId = core.getInput('pipeline');
  const herokuApiToken = core.getInput('heroku_api_token');
  const appJsonPath = core.getInput('app_json');
  const pipelineStage = core.getInput('stage');
  const prNumber = core.getInput('pr_number');

  const herokuBranch = github.context.ref;

  const appJson: AppJson = JSON.parse(fs.readFileSync(appJsonPath).toString());
  const heroku = new Heroku({token: herokuApiToken});

  const apps = await heroku.get<HerokuPlatformApiApp[]>('/apps');
  const sourceApp = apps.find(({name}) => name === envFrom);
  const existingApp = apps.find(({name}) => name === appName);

  if (existingApp) {
    console.log(`App exists: ${existingApp.id}`);
  } else if (sourceApp) {
    const newApp = await createApp(heroku, appName, sourceApp, pipelineId, pipelineStage, appJson, {
      HEROKU_PR_NUMBER: prNumber,
      HEROKU_APP_NAME: appName,
      HEROKU_BRANCH: herokuBranch,
    });
  }
}

run().catch((e) => {
  console.error(e);
  core.setFailed(e.message);
});

