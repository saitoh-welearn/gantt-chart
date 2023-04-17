import { LightningElement, api, track, wire } from "lwc";
import { refreshApex } from "@salesforce/apex";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

import momentJS from "@salesforce/resourceUrl/momentJS";
import { loadScript } from "lightning/platformResourceLoader";

import getChartData from "@salesforce/apex/ganttChart.getChartData";
import getProjects from "@salesforce/apex/ganttChart.getProjects";
import getResources from "@salesforce/apex/ganttChart.getResources";
import getHolidays from "@salesforce/apex/ganttChart.getHolidays";


export default class GanttChart extends LightningElement {
  @api recordId = "";
  @api objectApiName;

  @track isResourceView;
  @track isProjectView;
  @track isRecordTypeView; 

  // design attributes
  @api defaultView;

  // navigation
  @track startDateUTC; // sending to backend using time
  @track endDateUTC; // sending to backend using time
  @track formattedStartDate; // Title (Date Range)
  @track formattedEndDate; // Title (Date Range)
  @track dates = []; // Dates (Header)
  dateShift = 7; // determines how many days we shift by

  // options
  @track datePickerString; // Date Navigation
  @track view = {
    // View Select
    options: [
      {
        label: "View by Day",
        value: "1/14"
      },
      {
        label: "View by Week",
        value: "7/10"
      },
      {
        label: "View by 30days",
        value: "30/12"
      }
    ],
    slotSize: 1,
    slots: 1
  };

  /*** Modals ***/
  // TODO: move filter search to new component?
  @track filterModalData = {
    disabled: true,
    message: "",
    colors: [],
    colorOptions: [],
    projects: [],
    projectRecordTypes: [], // Record Type Id for each option
    roles: [],
    status: "",
    projectOptions: [],
    projectRecordTypeOptions: [], // To filter based on the record types 
    roleOptions: [],
    statusOptions: [
      {
        // TODO: pull from backend? unsure how to handle "All"
        label: "All",
        value: ""
      },
      {
        label: "Hold",
        value: "Hold"
      },
      {
        label: "Unavailable",
        value: "Unavailable"
      }
    ]
  };
  _filterData = {
    colors: [],
    projects: [],
    projectIds: [],
    projectRecordType: [], // to track record type Ids 
    roles: [],
    status: ""
  };
  @track resourceModalData = {};
  /*** /Modals ***/

  // gantt_chart_resource
  @track startDate;
  @track endDate;
  @track projectId;
  @track resources = [];

  constructor() {
    super();
    this.template.addEventListener("click", this.closeDropdowns.bind(this));
  }

  connectedCallback() {
    Promise.all([
      loadScript(this, momentJS)
    ]).then(() => {
      switch (this.defaultView) {
        case "View by Day":
          this.setView("1/14");
          break;
        default:
          this.setView("7/10");
      }
      this.setStartDate(new Date());
      this.handleRefresh();
    });
  }

  // catch blur on allocation menus
  closeDropdowns() {
    Array.from(
      this.template.querySelectorAll(".lwc-resource-component")
    ).forEach(row => {
      row.closeAllocationMenu();
    });
  }

  /*** Navigation ***/
  setStartDate(_startDate) {
    if (_startDate instanceof Date && !isNaN(_startDate)) {
      _startDate.setHours(0, 0, 0, 0);

      this.datePickerString = _startDate.toISOString();

      this.startDate = moment(_startDate)
        .day(1)
        .toDate();
      //this.startDateUTC =  moment(this.startDate).utc().valueOf() - moment(this.startDate).utcOffset() * 60 * 1000 +"";
      //console.log(this.startDateUTC);
      this.startDateUTC = this.startDate.getTime();
      this.formattedStartDate = this.startDate.toLocaleDateString();

      this.setDateHeaders();
    } else {
      this.dispatchEvent(
        new ShowToastEvent({
          message: "Invalid Date",
          variant: "error"
        })
      );
    }
  }

  //休日
  @track holidays =[];
/*
  //レコードページのガントチャートで以下のエラーが発生する。
   [LWC component's @wire target property or method threw an error during value provisioning. 
   moment is not defined
   
  @wire(getHolidays)
  wiredGetHolidays({ data, error }) {
      if (data) {
          //this.holidays = data;
          this.holidays = data.map(holiday => holiday.HolidayDate__c);
          console.log("holidays" + JSON.stringify(this.holidays));
          this.setDateHeaders();
      } else if (error) {
          console.error(error);
      }
  }
*/
 
  setDateHeaders() {
    this.endDate = moment(this.startDate)
      .add(this.view.slots * this.view.slotSize - 1, "days")
      .toDate();
//    this.endDateUTC = moment(this.endDate).utc().valueOf() - moment(this.endDate).utcOffset() * 60 * 1000 +"";
    this.endDateUTC = this.endDate.getTime();
    this.formattedEndDate = this.endDate.toLocaleDateString();

    const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    today = today.getTime();

    getHolidays()
      .then( data=>{ this.holidays = data.map(holiday => holiday.HolidayDate__c) })
      .catch(error => this.dispatchEvent(
                            new ShowToastEvent({
                            message: error.body.message,
                            variant: 'error'})) 
      );

    let dates = {};

    for (let date = moment(this.startDate); date <= moment(this.endDate); date.add(this.view.slotSize, "days")) {
      let index = date.format("YYYYMM");
      if (!dates[index]) {
        dates[index] = {
          dayName: '',
          name: date.format("MMMM"),
          days: []
        };
      }

      let day = {
        id: "" + date.format("YYYY-MM-DD"),  //キムリナ追記
        class: "slds-col slds-p-vertical_x-small slds-m-top_x-small lwc-timeline_day",
        label: date.format("M/D"),
        start: date.toDate()
      };

      if (this.view.slotSize > 1) {
        let end = moment(date).add(this.view.slotSize - 1, "days");
        day.end = end.toDate();
      } else {
        day.end = date.toDate();
        day.dayName = date.format("ddd");
        if (date.day() === 0|| date.day() === 6) {
          day.class = day.class + " lwc-is-week-end";
        }
      }

      if (today >= day.start && today <= day.end) {
        day.class += " lwc-is-today";
      }

      //休日のクラス追加
      if (this.holidays.includes(day.id)) {
        day.class += " lwc-is-holiday";
      }
      //キムリナ追記終了
      dates[index].days.push(day);
      dates[index].style =
        "width: calc(" +
        dates[index].days.length +
        "/" +
        this.view.slots +
        "*100%)";
    }

    // reorder index
    this.dates = Object.values(dates);

    Array.from(
      this.template.querySelectorAll("c-gantt_chart_resource")
    ).forEach(resource => {
      resource.refreshDates(this.startDate, this.endDate, this.view.slotSize);
    });
  }

  navigateToToday() {
    this.setStartDate(new Date());
    this.handleRefresh();
  }

  navigateToPrevious() {
    let _startDate = new Date(this.startDate);
    _startDate.setDate(_startDate.getDate() - this.dateShift);

    this.setStartDate(_startDate);
    this.handleRefresh();
  }

  navigateToNext() {
    let _startDate = new Date(this.startDate);
    _startDate.setDate(_startDate.getDate() + this.dateShift);

    this.setStartDate(_startDate);
    this.handleRefresh();
  }

  navigateToDay(event) {
    this.setStartDate(new Date(event.target.value + "T00:00:00"));
    this.handleRefresh();
  }

  setView(value) {
    let values = value.split("/");
    this.view.value = value;
    this.view.slotSize = parseInt(values[0], 10);
    this.view.slots = parseInt(values[1], 10);
  }

  handleViewChange(event) {
    this.setView(event.target.value);
    this.setDateHeaders();
    this.handleRefresh();
  }
  /*** /Navigation ***/

  /*** Resource Modal ***/
  openAddResourceModal() {

    window.console.log('Resources = ' + JSON.stringify(getResources()));
    getResources()
      .then(resources => {
        let excludeResources = this.resources;
        this.resourceModalData = {
          disabled: true,
          resources: resources
            .filter(resource => {
              return (
                excludeResources.filter(excludeResource => {
                  return excludeResource.Id === resource.Id;
                }).length === 0
              );
            })
            .map(resource => {
              return {
                label: resource.Name,
                value: resource.Id,
                role: resource.Default_Role__c
              };
            })
        };
        window.console.log('Post Resources = ' + JSON.stringify(this.resourceModalData));
        this.template.querySelector(".resource-modal").show();
      })
      .catch(error => {
        this.dispatchEvent(
          new ShowToastEvent({
            message: error.body.message,
            variant: "error"
          })
        );
      });
  }

  handleResourceSelect(event) {
    let self = this;

    self.resourceModalData.resources.forEach(resource => {
      if (resource.value === event.target.value) {
        self.resourceModalData.resource = {
          Id: resource.value,
          Name: resource.label,
          Default_Role__c: resource.role
        };
      }
    });

    this.validateResourceModalData();
  }

  validateResourceModalData() {
    if (!this.resourceModalData.resource) {
      this.resourceModalData.disabled = true;
    } else {
      this.resourceModalData.disabled = false;
    }
  }

  addResourceById() {
    let newResource = Object.assign({}, this.resourceModalData.resource);
    newResource.allocationsByProject = [];
    this.resources = this.resources.concat([newResource]);

    this.template.querySelector(".resource-modal").hide();

    this.resourceModalData = {
      disabled: true,
      resources: []
    };
  }
  /*** /Resource Modal ***/

  /*** Filter Modal ***/
  stopProp(event) {
    event.stopPropagation();
  }

  clearFocus() {
    this.filterModalData.focus = null;
  }

  openFilterModal() {
    this.filterModalData.colors = Object.assign(
      [], 
    this._filterData.colors
    );
    this.filterModalData.projects = Object.assign(
      [],
      this._filterData.projects
    );
    this.filterModalData.roles = Object.assign([], this._filterData.roles);
    this.filterModalData.status = this._filterData.status;
    this.template.querySelector(".filter-modal").show();
  }

  filterColors(event){
    this.hideDropdowns();
    let text = event.target.value;
    // only show roles not selected
    this.filterModalData.colorOptions = this.colors
      .filter(color => {
        return (
          color.toLowerCase().includes(text.toLowerCase()) &&
          !this.filterModalData.colors.filter(c => {
            return c === color;
          }).length
        );
      })
      .map(color => {
        return color;
      });
     
    this.filterModalData.focus = "colors";
    console.log("colors"+JSON.stringify(this.colors) );
  
  }

  addColorFilter(event){
    this.filterModalData.colors.push(event.currentTarget.dataset.color);
    this.filterModalData.focus = null;
    this.setFilterModalDataDisable();
  }
  
  removeColorFilter(event){
    this.filterModalData.colors.splice(event.currentTarget.dataset.index, 1);
    this.setFilterModalDataDisable();
  }

  filterProjects(event) {
    this.hideDropdowns();

    let text = event.target.value;

    getProjects().then(projects => {
      // only show projects not selected
      this.filterModalData.projectOptions = projects.filter(project => {
        return (
          project.Name &&
          project.Name.toLowerCase().includes(text.toLowerCase()) &&
          !this.filterModalData.projects.filter(p => {
            return p.id === project.Id;
          }).length
        );
      });
      this.filterModalData.focus = "projects";
    });
  }
  // Mohit's filter by record type
  filterProjectRecords(event) {
    this.hideDropdowns();
  
    let text = event.target.value;
  
    getProjects().then(projects => {
      // only show projects not selected
      this.filterModalData.projerojectRecordTypeOptions = projects.filter(project => {
        return (
          project.RecordTypeId &&
          !this.filterModalData.projects.filter(p => {
            return p.id === project.RecordTypeId;
          }).length
        );
      });
      this.filterModalData.focus = "rojectRecordTypeOptions";
    });
  }
  
  addProjectFilter(event) {
    this.filterModalData.projects.push(
      Object.assign({}, event.currentTarget.dataset)
    );
    this.filterModalData.focus = null;

    this.setFilterModalDataDisable();
  }

  // Mohit's addProjectRecordTypeFilter 
  addProjectRecordTypeFilter(event) {
    this.filterModalData.projectRecordTypes.push(
      Object.assign({}, event.currentTarget.dataset)
    );
    this.filterModalData.focus = null;

    this.setFilterModalDataDisable();
  }

  removeProjectFilter(event) {
    this.filterModalData.projects.splice(event.currentTarget.dataset.index, 1);
    this.setFilterModalDataDisable();
  }

  filterRoles(event) {
    this.hideDropdowns();

    let text = event.target.value;

    // only show roles not selected
    this.filterModalData.roleOptions = this.roles
      .filter(role => {
        return (
          role.toLowerCase().includes(text.toLowerCase()) &&
          !this.filterModalData.roles.filter(r => {
            return r === role;
          }).length
        );
      })
      .map(role => {
        return role;
      });
    this.filterModalData.focus = "roles";
  }

  addRoleFilter(event) {
    this.filterModalData.roles.push(event.currentTarget.dataset.role);
    this.filterModalData.focus = null;
    this.setFilterModalDataDisable();
  }

  removeRoleFilter(event) {
    this.filterModalData.roles.splice(event.currentTarget.dataset.index, 1);
    this.setFilterModalDataDisable();
  }

  setStatusFilter(event) {
    this.filterModalData.status = event.currentTarget.value;
    this.setFilterModalDataDisable();
  }

  clearFilters() {
    this.filterModalData.colors = [];
    this.filterModalData.projects = [];
    this.filterModalData.roles = [];
    this.filterModalData.status = "";
    this.filterModalData.disabled = true;
  }

  setFilterModalDataDisable() {
    this.filterModalData.disabled = true;

    if (
      this.filterModalData.colors.length > 0 ||
      this.filterModalData.projects.length > 0 ||
      this.filterModalData.roles.length > 0 ||
      this.filterModalData.status !== ""
    ) {
      this.filterModalData.disabled = false;
    }
  }

  hideDropdowns() {
    // prevent menu from closing if focused
    if (this.filterModalData.focus) {
      return;
    }
    this.filterModalData.colorOptions = [];
    this.filterModalData.projectOptions = [];
    this.filterModalData.roleOptions = [];
  }

  applyFilters() {
    this._filterData = {
      colors: Object.assign([], this.filterModalData.colors),
      projects: Object.assign([], this.filterModalData.projects),
      roles: Object.assign([], this.filterModalData.roles),
      status: this.filterModalData.status
    };

    this._filterData.projectIds = this._filterData.projects.map(project => {
      return project.id;
    });
    /*
    this._filterData.projectRecordType = this._filterData.projects.map(project => {
      return project.recordTypeId;
    });
*/
    let filters = [];

    if (this.filterModalData.colors.length) {
      filters.push("Colors");
    }

    if (this.filterModalData.projects.length) {
      filters.push("Projects");
    }
    /*
    if (this.filterModalData.projectRecordType.length) {
      filters.push("projectRecordTypes");
    }
    */
    if (this.filterModalData.roles.length) {
      filters.push("Roles");
    }
    if (this.filterModalData.status) {
      filters.push("Status");
    }
    if (this.filterModalData.status) {
      filters.push("Status");
    }

    if (filters.length) {
      this._filterData.message = "Filtered By " + filters.join(", ");
    }

    this.handleRefresh(true);
    this.template.querySelector(".filter-modal").hide();
  }
  /*** /Filter Modal ***/

  // @wire(getChartData, {
  //   recordId: "$recordId",
  //   startTime: "$startDateUTC",
  //   endTime: "$endDateUTC",
  //   slotSize: "$view.slotSize",
  //   filterProjects: "$_filterData.projectIds",
  //   filterRoles: "$_filterData.roles",
  //   filterStatus: "$_filterData.status"
  // })
  // wiredChartData(value) {
  //   const {error, data} = value;
  //   this.wiredData = value;
    
  //   if (data) {
  //     this.isResourceView =
  //       typeof this.objectApiName !== "undefined" &&
  //       this.objectApiName.endsWith("Resource__c");
  //     this.isProjectView =
  //       typeof this.objectApiName !== "undefined" &&
  //       this.objectApiName.endsWith("Project__c");
  //     this.projectId = data.projectId;
  //     this.projects = data.projects;
  //     this.roles = data.roles;

  //     // empty old data
  //     // we want to keep resources we've already seen
  //     this.resources.forEach((resource, i) => {
  //       this.resources[i] = {
  //         Id: resource.Id,
  //         Name: resource.Name,
  //         Default_Role__c: resource.Default_Role__c,
  //         allocationsByProject: {}
  //       };
  //     });

  //     data.resources.forEach(newResource => {
  //       for (let i = 0; i < this.resources.length; i++) {
  //         if (this.resources[i].Id === newResource.Id) {
  //           this.resources[i] = newResource;
  //           return;
  //         }
  //       }

  //       this.resources.push(newResource);
  //     });
  //   } else if (error) {
  //     this.dispatchEvent(
  //       new ShowToastEvent({
  //         message: error.message,
  //         variant: "error"
  //       })
  //     );
  //   }
  // }

  handleRefresh(applyFilter=false) {
    // refreshApex(this.wiredData);
    let self = this;

    getChartData({
        recordId: self.recordId ? self.recordId : '',
        startTime: self.startDateUTC,
        endTime: self.endDateUTC,
        slotSize: self.view.slotSize,
        filterColors: self._filterData.colors,
        filterProjects: self._filterData.projectIds,
        filterProjectRecords: self._filterData.projectRecordTypes, // filter for record types
        filterRoles: self._filterData.roles,
        filterStatus: self._filterData.status
    }).then(data => {
        self.isResourceView = typeof self.objectApiName !== 'undefined' && self.objectApiName.endsWith('Resource__c');
        self.isProjectView = typeof self.objectApiName !== 'undefined' && self.objectApiName.endsWith('Project__c');
        self.isRecordTypeView = typeof self.objectApiName !== 'undefined' && self.objectApiName.endsWith('Project__c');
        self.projectId = data.projectId;
        self.colors =data.colors;
        self.projects = data.projects;
        self.roles = data.roles;

        // empty old data
        // we want to keep resources we've already seen
        self.resources.forEach(function (resource, i) {
            self.resources[i] = {
                Id: resource.Id,
                Name: resource.Name,
                Default_Role__c: resource.Default_Role__c,
                allocationsByProject: {}
            };
        });

        data.resources.forEach(function (newResource) {
            for (let i = 0; i < self.resources.length; i++) {
                if (self.resources[i].Id === newResource.Id) {
                    self.resources[i] = newResource;
                    return;
                }
            }

            self.resources.push(newResource);
        });

        if (applyFilter && (self._filterData.colors != "" || self._filterData.projectIds != "" || self._filterData.roles != ""  || self._filterData.status != "")) {
          self.resources = self.resources.filter(resource => JSON.stringify(resource.allocationsByProject) !== '{}');
        }
        
        debugger;
    }).catch(error => {
        this.dispatchEvent(new ShowToastEvent({
            message: error.body.message,
            variant: 'error'
        }));
    });
  }
}