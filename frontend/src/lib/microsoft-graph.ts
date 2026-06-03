/**
 * Microsoft Graph API Utility for Teams and OneNote Sync
 */

export async function fetchFromGraph(endpoint: string, accessToken: string) {
    const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `Microsoft Graph API error: ${response.statusText}`);
    }

    return response.json();
}

export async function getJoinedTeams(accessToken: string) {
    const data = await fetchFromGraph('/me/joinedTeams', accessToken);
    return data.value; // Array of { id, displayName, description }
}

export async function getTeamMembers(teamId: string, accessToken: string) {
    // Note: /teams/{id}/members requires specific permissions like TeamMember.Read.All
    const data = await fetchFromGraph(`/teams/${teamId}/members`, accessToken);
    return data.value; // Array of { id, displayName, roles, email }
}

export async function getOneNoteNotebooks(groupId: string, accessToken: string) {
    try {
        const data = await fetchFromGraph(`/groups/${groupId}/onenote/notebooks`, accessToken);
        return data.value; // Array of { id, displayName, links: { oneNoteWebUrl: { href } } }
    } catch (error) {
        console.error(`Failed to fetch OneNote notebooks for group ${groupId}:`, error);
        return [];
    }
}
