/* jshint esversion:6 */
require("promise");
var JiraApi = require("jira").JiraApi;


var argv = require("optimist")
	.usage("Usage: $0 --user [String] --password [String] --host [String] --epicKey [String] --project [String] --prefix [String] --debug [boolean]")
    .demand(["user","password", "host", "epicKey"]).argv;

const epic = argv.epicKey;
const newProjectKey = argv.project;
const prefix = argv.prefix;
var ticketsMap = {};


/**
 * Algorythm :
 * 1. Clone Epic with it's subtickets
 * 2. Find all tickets linked to the epic
 * 3. Clone all linked subtickets to the epic with their subtickets
 * 4. Link issues to new structure
 */


var jiraWrapper = (function (){

	const retries = 10;
 
	const jira = new JiraApi("https",
		argv.host, 
		443,
		argv.user, argv.password, "2", true);


	/**
	 * Find ticket by key value with specific retry number
	 *
	 * @param  {[type]} key         [description]
	 * @param  {[type]} retryNumber [description]
	 *
	 * @return {[type]}             [description]
	 */
	var findTicketByKey = function(key, retryNumber = 0) {
		console.log("KEY: ", key);
		if (key == undefined || key == "") {
			console.log("Key of the ticket is undefined");
		 	return Promise.reject(new Error("Key is undefined."));
		}
		if (retryNumber > this.retries) {
			return Promise.reject(new Error("Reached limit of retries to find tikcet " + key));
		}
		return new Promise(function(resolve, reject) {
			jira.findIssue(key, function(err, issue) {
				if (err) {
					console.log(retryNumber, err);
					resolve (findTicketByKey(key, retryNumber + 1));
	            } else {
	                resolve(issue);
	            }
			});
	    });
	};

	return {
		findTicketByKey : findTicketByKey
	};


})();

var cloneTemplateOfTicket = (function(){
	var orginalKey;
	const subtasks = [];
	var ticketFields;

	var setOrginalKey = function(key) {
		this.orginalKey = key;
		return Promise.resolve(this);
	};

	var resolveTicket = function(){
		return jiraWrapper.findTicketByKey(this.orginalKey).then(function(value){
				this.ticketFields = prepareTemplate(value);
				return Promise.resolve(this);
		}).catch(function(err){
			console.log(err);
			return Promise.reject(new Error(err));
		});

	};

	return {
		setOrginalKey : setOrginalKey,
		resolveTicket : resolveTicket
	};
})();

// cloneTemplateOfTicket.setOrginalKey("IT-6822")
// .then(async function(result, reject){
// 	result = await result.resolveTicket();

// 	console.log(result.ticketFields);

	
// });

/**
 * Connection to jira
 *
 * @type {JiraApi}
 */
var jira = new JiraApi("https",
	argv.host, 
	443,
	argv.user, argv.password, "2", true);

/**
 * Check if debug is turn on
 *
 * @return {boolean} - debug of
 */
function debug(){
	if (argv.debug) {
		return true;
	}

	return false;
}

/**
 * Get prefix
 *
 * @return {[type]} [description]
 */
function getPrefix(){
	if (argv.prefix) {
		return argv.prefix;
	}

	return "";
}

/**
 * Write debug message
 *
 * @param  {string} message - message to print
 *
 * @return {void}  
 */
function debugMessage(message) {
	if(debug()){
		console.log(message);
	}
}

/**
 * Info message
 *
 * @param  {string} message info message to print
 *
 * @return {void}
 */
function infoMessage(message) {
	console.log("INFO: ", message);
}

/**
 * Template of the issue
 *
 * @return {object} temple of the issue
 */
var issueTemplate = function () {
	return {
		fields : {
			summary:"",
			issuetype: {},
			priority:{},
		}
	};
};


/**
 * Prepare template of the issue
 *
 * @param  {object} issue template 
 *
 * @return {object}       return object
 */
var prepareTemplate = function (issue) {

	//console.log(issue);
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

	//copy description
	// if (issue.fields && issue.fields.customfield_10010 && issue.fields.customfield_10010.value) {
	//  		issue.fields.status = {}
	// 		console.log(clone.ticket.fields.customfield_10010);
	// 		clone.ticket.fields.customfield_10010 = {}
	//  		clone.ticket.fields.customfield_10010.value = issue.fields.customfield_10010.value;
	// }


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


	clone.ticket.fields.summary = getPrefix() + issue.fields.summary;


	clone.ticket.fields.priority.id = issue.fields.priority.id;
	if (clone.ticket.fields.assignee) {
		clone.ticket.fields.assignee = {};
		clone.ticket.fields.assignee.name = issue.fields.assignee.name;
	}
	clone.ticket.fields.issuetype.name = issue.fields.issuetype.name;

	if (issue.fields.parent && issue.fields.parent.key) {
		clone.ticket.fields.parent = {};
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
};

/**
 * Find ticket by key value with specific retry number
 *
 * @param  {[type]} key         [description]
 * @param  {[type]} retryNumber [description]
 *
 * @return {[type]}             [description]
 */
var findTicketByKey = function(key, retryNumber) {
	if (!retryNumber) {
		retryNumber = 0;
	}
	return new Promise(function(resolve, reject) {
		jira.findIssue(key, function(err, issue) {
			if (err) {
				resolve (findTicketByKey(key, retryNumber + 1));
            } else {
                resolve(issue);
            }
		});
    });
};


function addNewTicket(template) {
	return new Promise(function(resolve, reject){
	});
}
/**
 * Clone ticket with specific template
 *
 * @param  String issue         ticket 
 * @param  Object cloneTemplate [description]
 *
 * @return {[type]}               [description]
 */
function cloneTicket(issue, cloneTemplate = null) {
	var cloneIssue = null;

	if (cloneTemplate) {
		cloneIssue = cloneTemplate;
	} else {
		cloneIssue = prepareTemplate(issue);
	}
	return new Promise(function(resolve, reject) {
		jira.addNewIssue(cloneIssue.ticket, (error ,response) => {
	 		var obj = {};
			if(response) {
			 	const newTicketKey = response.key;
			 	// console.log('Cloned ticket ', issue.key, ' -> ', newTicketKey);
			 	if (issue.fields.subtasks) {
			 		Promise.all(issue.fields.subtasks.map(
			 		 	function (obj) {
			 		 		return cloneSubtask(obj, newTicketKey);
			 		 	}
			 		))
			 		.then(
			 			function(data){
				 			var obj_ = {};
				 			obj_[issue.key] = newTicketKey;
				 			data.push(obj_);
				 		    resolve(data);
			 			}, 
			 			function(err){
			 				debugMessage("Error when adding new issue : ", cloneIssue.ticket, "Data", data, '\nError', err);
			 			}
			 		);
			 	} else {
			 		obj[issue.key] = newTicketKey;
			 		resolve(obj);
			 	}
			}

			if (error) {
	 			resolve (cloneTicket(issue, cloneTemplate));
			}		
		});
	});
}


function cloneSubtask(issue_, parent_){
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
				jira.addNewIssue(prepareTemplate(tmp).ticket, (error ,response) => {

					if(response && !error) {
					 	const newTicketKey = response.key;
					 		var obj = {};
					 		obj[issue_.key] = response.key;
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


function copyElements(data) {
	var tmp =[];
	data.forEach(d => {
		if (d.constructor === Array) {
			d.forEach(e => {
				tmp.push(e);
			});
		} else {
			tmp.push(d);
		}
	});
	return tmp;
}


/**
 * 
 *
 * @param  {[type]} epicNumber   [description]
 * @param  {[type]} newTicketKey [description]
 *
 * @return {[type]}              [description]
 */
var cloneEpicTicketst = function (epicNumber, newTicketKey) {
	var tickets_ = [];
	return new Promise(function(resolve, reject) {
		jira.searchJira("\"Epic Link\" = " + epicNumber, null, (error, body) => {
			var res = Promise.all(
						body.issues.map(function (obj) {
			 		 		return cloneEpicTicket(obj, newTicketKey);
			 		 	})).then(function(data){
									resolve(copyElements(data));
								}, function (err){

								});					
		});
	});
};

var cloneEpicTicket = function(issue, newTicketKey_){
	return findTicketByKey(issue.key).then(function(result){
		var tmp = result;
		tmp.fields.customfield_10009 = newTicketKey_;
			return cloneTicket(result, prepareTemplate(tmp))
					.then(	function(res){ 
								return res;
							}, 
							function(err){
								debugMessage(["This should not happend", err]);
							});
	});
};



/**
 * @param  {Object}
 * @param  {[type]}
 * @return {[type]}
 */
function findTicketInObject (obj, ticket) {
	if (obj[ticket]){
		return obj[ticket];
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
		return findTicketInObject(obj, ticket);
	});
	tmp = tmp.clean(undefined);
	return tmp[0];
};

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

				console.log("Ticket is not cloned ", linkedIssueData.outwardIssue.key);
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
				};
		jira.updateIssue(findClonedTicketKey(ticketNumber, data), updatestr, function(err, res){
			if (err || !res) {
				// console.log("Error during updating tikcet: ", ticketNumber, "Error :", err, "Response : ". res);
				return updateLinkedIssues(ticketNumber, linkedIssueData, data);
			} 
			return res;
		});
	} else if (linkedIssueData.inwardIssue) {
		var tmp_ = findClonedTicketKey(linkedIssueData.inwardIssue.key, data);
		if (tmp_ == null || tmp_ === undefined) {
			tmp_ = linkedIssueData.inwardIssue.key;
				console.log("Ticket is not cloned but linked ", linkedIssueData.inwardIssue.key);
			}
		var updatestr_ = {
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
				                  "key": tmp_
				               }
				            }
				         }
				      ]
				   }
				};
		jira.updateIssue(findClonedTicketKey(ticketNumber, data), updatestr_, function(err, res){
			if (err || !res) {
				// console.log("Error during updating tikcet: ", ticketNumber, "Error :", err, "Response : ". res);
				return updateLinkedIssues(ticketNumber, linkedIssueData, data);
			} 
			return res;
		});
	} else {
		console.log("Something wrong!!" , ticketNumber, linkedIssueData);
	}

};

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
	      						debugMessage("Error when updatating ranking for ticket", err);
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
	var listOfAllIssues = [];

	return findTicketByKey(epicKey)
				.then(function(issue){
						return cloneTicket(issue)
								.then(function(result){
									return cloneEpicTicketst(epicKey, findClonedTicketKey(epicKey , result))
											.then(function(res){
												listOfAllIssues.push(res);
												result = copyElements(result);
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
//cloneTemplateOfTicket("IT-6821");



