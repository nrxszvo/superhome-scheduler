function groupByBuddy(rsvs) {
    let grps = [];
    for (const rsvA of rsvs) {
        const thisBg = new Set([rsvA.id]);
        for (const id of rsvA.buddies.id) {
            // make sure the requested buddies have their own reservations
            for (const rsvB of rsvs) {
                if (rsvB.user.id === id) {
                    thisBg.add(rsvB.id);
                }
            }
        }
        // check if a group with one or more of these buddies
        // already exists and add buddies from that group to this one if so
        for (let i = grps.length-1; i >= 0; i--) {
            const bg = grps[i];
            if (Array.from(bg).filter((v) => thisBg.has(v)).length > 0) {
                for (const id of bg) {
                    thisBg.add(id);
                }
                grps.splice(i,1);
            }
        }
        grps.push(thisBg);
    }

    // replace rsv ids with copies of rsv objects
    // and convert sets to arrays
    const rsvById = rsvs.reduce((obj,rsv) => {
        obj[rsv.id] = rsv;
        return obj;
    }, {});
    return grps.map((g) => Array.from(g).map((id) => rsvById[id]));
}

const sortBuddies = (rsvs) => {
    return rsvs.sort((a,b) => a.maxDepth < b.maxDepth ? 1 : -1);
};

function sortBuddyGroups(buddyGrps) {
    return buddyGrps
        .map((g) => sortBuddies(g))
        .sort((a,b) => a[0].maxDepth < b[0].maxDepth ? 1 : -1);
}

function createBuoyGroups(buddyGrps, maxDepthDiff) {
    const buoyGrps = [];
    // first add all rsvs with resType==course to their own buoys
    for (let i = buddyGrps.length-1; i >= 0; i--) {
        if (buddyGrps[i][0].resType === 'course') {
            buoyGrps.push(buddyGrps[i]);
            buddyGrps.splice(i,1);
        }
    }
    // then add buddy groups of 3 to buoys, splitting up a group if it has more than 3
    let i = buddyGrps.length-1;
    while (i >= 0) {
        const bg = buddyGrps[i];
        if (bg.length == 3) {
            buoyGrps.push(bg);
            buddyGrps.splice(i,1);
            i--;
        } else if (bg.length > 3) {
            // split top 3 deepest buddies into their own group
            let top3 = bg.splice(0,3);
            buoyGrps.push(top3);
        } else {
            i--;
        }
    }
    // re-sort buddy groups, which now consists only of groups of 1 or 2 divers
    buddyGrps = sortBuddyGroups(buddyGrps);

    // try to avoid pairing buddies with maxDepths that differ by 10+ meters
    const depthsTooFar = (bg0, bg1, tooFar=10) => {
        return bg0[bg0.length-1].maxDepth - bg1[0].maxDepth >= tooFar;
    };

    // helper for creating a buoy group from buddy groups and removing from buddyGrps
    const update = (bgs, idx) => {
        const bg = bgs.reduce((acc, g) => acc.concat(g), []);
        buoyGrps.push(sortBuddies(bg));
        for (let i of idx.sort().reverse()) {
            buddyGrps.splice(i,1);
        }
    };

    // bg0 and bgX both consist of one diver each
    // find the best pair of 3 divers from subsequent buddy groups
    // could be bg0 + bgX + another group with one diver, or bg0 plus another group of two
    const matchOneOrTwo = (bg0, bgX, xIdx, idx, tooFar) => {
        if (idx == buddyGrps.length) {
            // couldnt find a good group of 3, so create group of 2
            update([bg0, bgX], [0, xIdx]);
        } else {
            let bg = buddyGrps[idx];
            if (depthsTooFar(bg0, bg, tooFar)) {
                // create group of 2 rather than combine buddies w/ disparate maxDepths
                update([bg0, bgX], [0, xIdx]);
            } else {
                if (bg.length == 1) {
                    update([bg0, bgX, bg], [0, xIdx, idx]);
                } else { // bg.length must equal 2
                    update([bg0, bg], [0, idx]);
                }
            }
        }
    };

    // edge case when there is one diver left who does not pair up nicely
    // with any of the existing buoy groups
    const addLastDiver = (rsv) => {
        let added = false;
        for (let i = buoyGrps.length-1; i >= 0; i--) {
            let Bg = buoyGrps[i];
            if (Bg[0].resType === 'autonomous') {
                if (Bg.length == 2) {
                    Bg.push(rsv);
                } else {
                    const buoy1 = Bg.slice(0,2);
                    const buoy2 = [Bg[2], rsv];
                    buoyGrps.splice(i,1);
                    buoyGrps.push(buoy1);
                    buoyGrps.push(buoy2);
                }
                added = true;
                break;
            }
        }
        if (!added) {
            // none of the groups are autonomous;
            // this is probably a fatal error, but best option is to
            // add the diver to the buoy with closest maxDepth and <= 3 divers
            let bestScore = Infinity;
            let bestMatch;
            let depth = rsv.maxDepth;
            for (let Bg of buoyGrps) {
                if (Bg[0].numStudents < 3) {
                    let score = Math.abs(Bg[0].maxDepth - depth);
                    if (score < bestScore) {
                        bestScore = score;
                        bestMatch = Bg;
                    }
                }
            }
            if (bestMatch) {
                bestMatch.push(rsv);
            } else {
                // give up and just add the diver to any buoy
                if (buoyGrps.length > 0) {
                    buoyGrps[0].push(rsv);
                } else {
                    buoyGrps.push([rsv]);
                }
            }
        }
        buddyGrps.splice(0,1);
    };

    // bg0 has either one or two divers
    // look for a good buddy group(s) to combine with bg0 to form a group of 3
    const matchOne = (bg0, idx, tooFar) => {
        if (idx == buddyGrps.length) {
            // couldnt find a good group of 3
            if (bg0.length == 2) {
                update([bg0], [0]);
            } else {
                // cant have a group with only one diver; find the best existing buoyGroup
                // to add this diver to
                addLastDiver(bg0[0]);
            }
        } else {
            let bg = buddyGrps[idx];
            let n = bg0.length + bg.length;

            if (depthsTooFar(bg0, bg, tooFar)) {
                // create a group of 2 rather than combine buddies with disparate maxDepths
                if (bg0.length == 2) {
                    update([bg0], [0]);
                } else {
                    // bg0.length == 1 and can't have a buoy with only one diver...
                    update([bg0, bg], [0, idx]);
                }
            } else if (n == 2) {
                return matchOneOrTwo(bg0, bg, idx, idx+1, tooFar);
            } else if (n == 3) {
                update([bg0, bg], [0, idx]);
            } else { // n == 4
                return matchOne(bg0, idx+1, tooFar);
            }
        }
    };

    while(buddyGrps.length > 0) {
        /*
        console.log('buddyGrps:');
        console.log(buddyGrps.map((bg)=> bg.map((rsv)=>rsv.maxDepth)));
        console.log('buoyGrps:');
        console.log(buoyGrps.map((bg)=> bg.map((rsv)=>rsv.maxDepth)));
        */
        const bg = buddyGrps[0];
        if (bg[0].resType === 'course') {
            update([bg], [0]);
        } else {
            matchOne(buddyGrps[0], 1, maxDepthDiff);
        }
    }
    /*
    console.log('buddyGrps:');
    console.log(buddyGrps.map((bg)=> bg.map((rsv)=>rsv.maxDepth)));
    console.log('buoyGrps:');
    console.log(buoyGrps.map((bg)=> bg.map((rsv)=>rsv.maxDepth)));
    */
    return buoyGrps;
}

function assignBuoyGroupsToBuoys(buoys, grps) {
    const assignments = {};
    buoys.sort((a,b) => a.maxDepth < b.maxDepth ? 1 : -1);
    // iterate from shallowest to deepest
    while (grps.length > 0) {
        const grp = grps[grps.length-1];
        let failedToAssign = true;
        for (let i=buoys.length-1; i >= 0; i--) {
            const buoy = buoys[i];
            if (buoy.maxDepth >= grp[0].maxDepth) {
                assignments[buoy.name] = grp;
                grps.splice(grps.length-1,1);
                buoys.splice(i,1);
                failedToAssign = false;
                break;
            }
        }
        if (failedToAssign) {
            return {
                status: 'error',
                message: 'Ran out of buoys',
                assignments
            }
        }
    }
    return { status: 'success', assignments }
}

export function assignRsvsToBuoys(buoys, rsvs) {

    let buddyGrps = sortBuddyGroups(groupByBuddy(rsvs));

    const maxDepthDiff = 15;
    let buoyGrps = createBuoyGroups(buddyGrps, maxDepthDiff);

    let result = assignBuoyGroupsToBuoys([...buoys], buoyGrps);

    return result;
}
