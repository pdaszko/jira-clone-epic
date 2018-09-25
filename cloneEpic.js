/* jshint esversion:6 */
var Promise = require("promise");
var JiraApi = require("jira").JiraApi;


var argv = require("optimist")
	.usage("Usage: $0 --user [String] --password [String] --host [String] --epicKey [String] --project [String]")
    .demand(["user","password", "host", "epicKey"]).argv;

const epic = argv.epicKey;
const newProjectKey = argv.project;
var ticketsMap = {};

// var jira = new JiraApi("https",
// 	argv.host, 
// 	443,
// 	argv.user, argv.password, "2", true);

var issueTemplate = function () {
	return {
		fields : {
			summary:"",
			issuetype: {},
			priority:{},
		}
	};
}

var prepareTemplate = function (issue) {
	const clone = {};
	clone.ticket = issueTemplate();

	//copy project
	if(issue.fields.project) {
		clone.ticket.fields.project = {};
		if (newProjectKey) {
			clone.ticket.fields.project.key = newProjectKey;
		} else {
			clone.ticket.fields.project.key = issue.fields.project.key;
		}
	}

	//copy description
	if (issue.fields.description) {
	 		clone.ticket.fields.description = issue.fields.description;
	}

	//copy labels
	if (issue.fields.labels) {
	 	clone.ticket.fields.labels = issue.fields.labels;
	}

	//
	if (issue.fields.customfield_10008) {
		clone.ticket.fields.customfield_10008 = issue.fields.customfield_10008;
	} 

	if (issue.fields.customfield_10009) {
		clone.ticket.fields.customfield_10009 = issue.fields.customfield_10009;
	}

	clone.ticket.fields.summary = issue.fields.summary;


	clone.ticket.fields.priority.id = issue.fields.priority.id;
	if (clone.ticket.fields.assignee) {
		clone.ticket.fields.assignee = {};
		clone.ticket.fields.assignee.name = issue.fields.assignee.name;
	}
	clone.ticket.fields.issuetype.name = issue.fields.issuetype.name;

	if (issue.fields.parent && issue.fields.parent.key) {
		clone.ticket.fields.parent = {}
		clone.ticket.fields.parent.key = issue.fields.parent.key;
	}

	if(issue.fields.subtasks) {
		if(!clone.subtasks) {
			clone.subtasks = [];
		}
		issue.fields.subtasks.forEach(function(issue){
			issue.fields.project = clone.ticket.fields.project;
			clone.subtasks.push(prepareTemplate(issue));
		});
	}

	return clone;
}


var findTicket = function (key) {
	return new Promise(function(resolve, reject) {
		var jira = new JiraApi("https", argv.host, 443, argv.user, argv.password, "2", true);
		jira.findIssue(key, function(err, issue) {
			if (err) {
				// console.log("Error on find issue 2");
                reject(err);
            } else {
                resolve(issue.key);
            }
		});
    })
}

var findTicketByKey = function(key, retryNumber) {
	if (!retryNumber) {
		retryNumber = 0;
	}
	return new Promise(function(resolve, reject) {
		var jira = new JiraApi("https", argv.host, 443, argv.user, argv.password, "2", true);
		jira.findIssue(key, function(err, issue) {
			if (err) {
				// console.log("Retry on find ", retryNumber);
				resolve (findTicketByKey(key, retryNumber + 1));
            } else {
                resolve(issue);
            }
		});
    })
}


var findKeyByKey = function(key) {
	return new Promise(function(resolve, reject) {
		var jira = new JiraApi("https", argv.host, 443, argv.user, argv.password, "2", true);
		jira.findIssue(key, function(err, issue) {
			if (err) {
				// console.log("Error on find issue 4");
                reject(err);
            } else {
                resolve(issue.key);
            }
		});

    })
}

var findTicketKey = function(ticket) {
	return ticket.key
}
 

var findTicketByTicket = function(key_) {
	return new Promise(function(resolve, reject) {
		var jira = new JiraApi("https", argv.host, 443, argv.user, argv.password, "2", true);
		jira.findIssue(key_.key, function(err, issue) {
			if (err) {
				// console.log("Error on find issue");
                reject(err);
            } else {
                resolve(issue);
            }
		});
    })
}

var cloneTicket = function  (issue, cloneTemplate = null) {
	var cloneIssue = null;

	if (cloneTemplate) {
		cloneIssue = cloneTemplate;
	} else {
		cloneIssue = prepareTemplate(issue);
	}
	return new Promise(function(resolve, reject) {
		var jira = new JiraApi("https", argv.host, 443, argv.user, argv.password, "2", true);
		jira.addNewIssue(cloneIssue.ticket, (error ,response) => {

			if(response && !error) {
			 	const newTicketKey = response.key;
			 	// console.log('Cloned ticket ', issue.key, ' -> ', newTicketKey);
			 	if (issue.fields.subtasks) {
			 		Promise.all(issue.fields.subtasks.map(
			 		 	function (obj) {
			 		 		return cloneSubtask(obj, newTicketKey);
			 		 	}
			 		))
			 		.then(function(data){
			 			var obj = {}
			 			obj[issue.key] = response.key;
			 			data.push(obj)
			 		    resolve(data);
			 		}

			 		// , function(err){
			 		// 	console.log("Error when adding new issue : ", cloneIssue.ticket, "Data", data, '\nError', err)
			 		// }


			 		);
			 	} else {
			 		var obj = {};
			 		obj[issue.key] = response.key
			 		var tmp_key = issue.key;
			 		resolve(obj);
			 	}
			} else {
				// console.log("Error when adding new issue : ", cloneIssue.ticket, '\n     Error', error);
	 			resolve (cloneTicket(issue, cloneTemplate));
			}		
		});
	});
}


var copyElements = function(data) {
	var tmp =[];
	data.forEach(d => {
		if (d.constructor === Array) {
			d.forEach(e => {
				tmp.push(e);
			})
		} else {
			tmp.push(d);
		}
	});
	return tmp;
}

var cloneEpicTicketst = function (epicNumber, newTicketKey) {
	var tickets_ = [];
	return new Promise(function(resolve, reject) {
		var jira = new JiraApi("https", argv.host, 443, argv.user, argv.password, "2", true);
		jira.searchJira("\"Epic Link\" = " + epicNumber, null, 
		(error, body) => {
			var res = Promise.all(body.issues.map(function (obj) {
			 		 	return cloneEpicTicket(obj, newTicketKey);
			 		 }))
						.then(function(data){
								 resolve(copyElements(data));
			}, function (err){
				// console.log("Error while cloning epic ticket :", err);
			});					
		});
	});
}

var cloneEpicTicket = function(issue, newTicketKey_){
	return findTicketByKey(issue.key).then(function(result){
		var tmp = result;
		tmp.fields.customfield_10009 = newTicketKey_;
			return cloneTicket(result, prepareTemplate(tmp))
					.then(	function(res){ 
								return res;
							}, 
							function(err){
								// console.log("Clone epic ticket error.", "\nTicket to clone: ", issue, "\nError: ", err, "\n Template: ", prepareTemplate(tmp));
								// console.log("Retrying:");
								return cloneTicket(result, prepareTemplate(tmp));
							});
	});
}

var cloneSubtask = function(issue_, parent_){
		return new Promise(function(resolve, reject) {
			findTicketByKey(issue_.key).then(function (issue){
					var tmp = issue_;
					tmp.fields.parent = { key: parent_ };
					if (issue.fields.labels) {
						tmp.fields.labels = issue.fields.labels;
					}

					if (issue.fields.description) {
	 					tmp.fields.description = issue.fields.description;
					}
			var jira = new JiraApi("https", argv.host, 443, argv.user, argv.password, "2", true);
				jira.addNewIssue(prepareTemplate(tmp).ticket, (error ,response) => {

					if(response && !error) {
					 	const newTicketKey = response.key;
					 		var obj = {};
					 		obj[issue_.key] = response.key
					 		var tmp_key = issue.key;
					 		resolve(obj);
					} else {
							// console.log('Retry...');
							resolve(cloneSubtask(issue_, parent_));
					}		
				});
			});
		});
}

/**
 * @param  {Object}
 * @param  {[type]}
 * @return {[type]}
 */
var findTicketInObject = function(obj, ticket) {
	if (obj[ticket]){
		return obj[ticket]
	}
}

/**
 * @param  {Object} - object to delete from array
 * @return {array} - cleaned array from array
 */
Array.prototype.clean = function(deleteValue) {
  for (var i = 0; i < this.length; i++) {
    if (this[i] == deleteValue) {         
      this.splice(i, 1);
      i--;
    }
  }
  return this;
};


var findClonedTicketKey = function(ticket, listOfCLonedTickets) {
	var tmp = listOfCLonedTickets.map(function(obj){
		return findTicketInObject(obj, ticket)
	});
	tmp = tmp.clean(undefined);
	return tmp[0]
}

/**
 *
 * @param  {String} ticketNumber - orginal ticket key
 * @param  {Object} linkedIssueData - linked issue data from orginal ticket
 * @param  {Array.Object} data - list of all orginal and cloned tickets
 *
 * @return {String} - key of updated ticket  
 */
var updateLinkedIssues = function(ticketNumber, linkedIssueData, data) {
	if (linkedIssueData.outwardIssue) {

		var tmp = findClonedTicketKey(linkedIssueData.outwardIssue.key, data);
		if (tmp == null || tmp === undefined) {
			tmp = linkedIssueData.outwardIssue.key;
				console.log("Ticket is not cloned ", linkedIssueData.outwardIssue.key)
			}
		var updatestr= {
				   "update":{
				      "issuelinks":[
				         {
				            "add":{
				               "type":{
				                  "name":linkedIssueData.type.name,
				                  "inward":linkedIssueData.type.inward,
				                  "outward":linkedIssueData.type.outward
				               },
				               "outwardIssue":{
				                  "key": tmp
				               }
				            }
				         }
				      ]
				   }
				}
		var jira = new JiraApi("https", argv.host, 443, argv.user, argv.password, "2", true);
		jira.updateIssue(findClonedTicketKey(ticketNumber, data), updatestr, function(err, res){
			if (err || !res) {
				// console.log("Error during updating tikcet: ", ticketNumber, "Error :", err, "Response : ". res);
				return updateLinkedIssues(ticketNumber, linkedIssueData, data);
			} 
			return res;
		});
	} else if (linkedIssueData.inwardIssue) {
		var tmp = findClonedTicketKey(linkedIssueData.inwardIssue.key, data);
		if (tmp == null || tmp === undefined) {
			tmp = linkedIssueData.inwardIssue.key;
				console.log("Ticket is not cloned but linked ", linkedIssueData.inwardIssue.key)
			}
		var updatestr= {
				   "update":{
				      "issuelinks":[
				         {
				            "add":{
				               "type":{
				                  "name":linkedIssueData.type.name,
				                  "inward":linkedIssueData.type.inward,
				                  "outward":linkedIssueData.type.outward
				               },
				               "inwardIssue":{
				                  "key": tmp
				               }
				            }
				         }
				      ]
				   }
				}
		var jira = new JiraApi("https", argv.host, 443, argv.user, argv.password, "2", true);
		jira.updateIssue(findClonedTicketKey(ticketNumber, data), updatestr, function(err, res){
			if (err || !res) {
				// console.log("Error during updating tikcet: ", ticketNumber, "Error :", err, "Response : ". res);
				return updateLinkedIssues(ticketNumber, linkedIssueData, data);
			} 
			return res;
		});
	} else {
		console.log("Something wrong!!" , ticketNumber, linkedIssueData);
	}

}

/**
 *
 * @param  {Object} ticket - object which represents key, value pair; an orginal and cloned tickets keys
 * @param  {Array.Object} data - list of objects which key, value pairl - an orginal and cloned tickets keys 
 *
 * @return {Array.Object} - list of updated tickets keys
 */
function udpateTickett (ticket, data) {
	var orginalTicketKey = Object.keys(ticket)[0];
	return findTicketByKey(orginalTicketKey).then(function(resolve){
		return resolve.fields.issuelinks.map(function(obj){
			var orginalTicketKey_ = orginalTicketKey;
			return updateLinkedIssues(orginalTicketKey_, obj, data);});
	});
}


var updateIssue2 = function(issueUpdate, callback) {
	var jira = new JiraApi("https", argv.host, 443, argv.user, argv.password, "2", true);
    var options = {
        rejectUnauthorized: jira.strictSSL,
        uri: jira.makeUri('rest/greenhopper/1.0/api/rank/after'),
        body: issueUpdate,
        method: 'PUT',
        followAllRedirects: true,
        json: true
    };

    jira.doRequest(options, function(error, response) {

        if (error) {
            callback(error,response, null);
            return;
        }

        if (response.statusCode === 200 || response.statusCode === 204) {
            callback(null, "Success");
            return;
        } else {
        	//console.log("Update issue response", response);
        	return;
        }
    });
};

function updateRanking(ticket, data) {
var jira = new JiraApi("https", argv.host, 443, argv.user, argv.password, "2", true);
	jira.searchJira("\"Epic Link\" = " + ticket + " ORDER BY Rank ", null, 
		(error, body) => {
			// if (error) {
			// 	console.log('Error when updating ranking ', error, '\n for ticket ', ticket);
			// }
			//console.log('Body', body);
			if (!error) {
				for (var i = 0; i < body.issues.length; i++) {
					if (i + 1 < body.issues.length) {
						var ticketBefore = findClonedTicketKey(body.issues[i].key, data);
						var ticketAfter = findClonedTicketKey(body.issues[i+1].key, data);
						var updateRankBody = {
	      										"issues": [ticketBefore],
	      										"rankBeforeIssue": ticketAfter
	      									}; 
	      				updateIssue2(updateRankBody, function(err, body_){
	      					if(err) {
	      						console.log("Error when updatating ranking for ticket", err);
	      						updateRanking(ticket, data);
	      					}
	      				});
					}
				}					
			} else{
				updateRanking(ticket, data);
			}
		});
}

var cloneEpic = function (epicKey) {
	return findTicketByKey(epicKey).then(function(issue){
		return cloneTicket(issue).then(function(result){
			console.log("Result: ", result);
			return cloneEpicTicketst(epicKey, findClonedTicketKey(epicKey , result)).then(function(res){
				result.push(res);
				//console.log("RESULT 0: ", result);
				result = copyElements(result);

				//console.log("RESULT 1: ", result);

				result.map(function (o){
					return udpateTickett(o, result);
				});

				//console.log("RESULT 2: ", result);
				updateRanking(epicKey, result);
				//console.log("RESULT 3: ", result);
				return result;

			 }, function(error){
			 	// console.log("Error main", error);
		}
			);

	}, 
			function(error){ 
				// console.log("Clone error ticket", error);
			});

	}, function(error){
		// console.log("Error on find main tikcet:", error);
	});
};

cloneEpic(epic).then(function(result){console.log("Cloned epic: ", findClonedTicketKey(epic, result));});


