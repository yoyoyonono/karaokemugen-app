import HTTP from '../lib/utils/http.js';
import logger from '../lib/utils/logger.js';
import { editRepo, getRepo } from '../services/repo.js';

const service = 'Gitlab';

/** Assign someone to an issue */
export async function assignIssue(issue: number, repoName: string) {
	let repo = getRepo(repoName);
	if (!repo.MaintainerMode) throw 'Maintainer mode is not enabled for this repository';
	const url = new URL(repo.Git.URL);
	const userID = await getUserID(repoName);
	const params = {
		assignee_id: userID,
	};
	if (!repo.Git.ProjectID) {
		// Editing the repo should trigger
		repo = await editRepo(repo.Name, repo);
	}
	await HTTP.put(`${url.protocol}//${url.hostname}/api/v4/projects/${repo.Git.ProjectID}/issues/${+issue}`, params, {
		headers: {
			'PRIVATE-TOKEN': repo.Git.Password,
			'Content-Type': 'application/json',
		},
		timeout: 25000,
	});
}

/** Get user ID from username */
export async function getUserID(repoName: string) {
	try {
		const repo = getRepo(repoName);
		if (!repo.MaintainerMode) throw 'Maintainer mode is not enabled for this repository';
		const url = new URL(repo.Git.URL);
		const res = await HTTP.get(`${url.protocol}//${url.hostname}/api/v4/users`, {
			params: {
				username: repo.Git.Username,
			},
			headers: {
				'PRIVATE-TOKEN': repo.Git.Password,
				'Content-Type': 'application/json',
			},
			timeout: 25000,
		});
		return res.data[0].id;
	} catch (err) {
		logger.error('Unable to get assign user to an issue', { service, obj: err });
		throw err;
	}
}
