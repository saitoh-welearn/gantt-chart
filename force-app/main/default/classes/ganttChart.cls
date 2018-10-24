public with sharing class ganttChart {
    @AuraEnabled(Cacheable=true)
    public static Map<String, Object> getChartData(Id recordId, Date startDate, Integer days) {
        Map<String, Object> data = new Map<String, Object>();
        Map<String, Object> resourceById = new Map<String, Object>();

        // workaround for bug W-4320896
        days = Integer.valueOf(days);
        
        if (null == days) {
            days = 14;
        }

        if (null == startDate) {
           startDate = Date.today();
        }

        Date endDate = Date.newInstance(startDate.year(), startDate.month(), startDate.day()).addDays(days);
        List<Allocation__c> allocations;

        if (null == recordId) {
            allocations = [SELECT Resource__c, Resource__r.Name
                          FROM Allocation__c
                          WHERE Start_Date__c <= :endDate
                          AND End_Date__c >= :startDate];
        } else if ('Project__c' == recordId.getSobjectType().getDescribe().getName()) {
            data.put('projectId', recordId);
            allocations = [SELECT Resource__c, Resource__r.Name
                           FROM Allocation__c
                           WHERE Project__c = :recordId
                           AND Start_Date__c <= :endDate
                           AND End_Date__c >= :startDate];
        } else {
            allocations = [SELECT Resource__c, Resource__r.Name
                           FROM Allocation__c
                           WHERE Resource__c = :recordId
                           AND Start_Date__c <= :endDate
                           AND End_Date__c >= :startDate];
        }

        for (Allocation__c allocation : allocations) {
            resourceById.put(allocation.Resource__c, new Map<String, Object> {
                'Id' => allocation.Resource__c,
                'Name' => allocation.Resource__r.Name
            });
        }
        data.put('resources', resourceById.values());
        
        return data;
    }

    @AuraEnabled(Cacheable=true)
    public static List<Object> getAllocationLists(Id recordId, Date startDate, Integer days) {
        if (null == days) {
            days = 14;
        }
        
        if (null == startDate) {
            startDate = Date.today();
        }

        Date endDate = Date.newInstance(startDate.year(), startDate.month(), startDate.day()).addDays(days);

        Map<String, Object> allocationsByProject = new Map<String, Object>();

        for (Allocation__c allocation : [SELECT Id, Name, Start_Date__c, End_Date__c, Project__c
                                         FROM Allocation__c
                                         WHERE Resource__c = :recordId
                                         AND Start_Date__c <= :endDate
                                         AND End_Date__c >= :startDate]) {
            if (!allocationsByProject.containsKey(allocation.Project__c)) {
                allocationsByProject.put(allocation.Project__c, new List<Allocation__c>());
            }

            ((List<Object>)allocationsByProject.get(allocation.Project__c)).add(allocation);
        }

        return allocationsByProject.values();
    }

    @AuraEnabled(Cacheable=true)
    public static List<Resource__c> getResources() {
        return [SELECT Id, Name
                FROM Resource__c
                WHERE Active__c = true];
    }

    @AuraEnabled
    public static void saveAllocation(Id allocationId, Id projectId, Id resourceId, String startDate, String endDate) {
        Allocation__c allocation = new Allocation__c(
            Start_Date__c = DateTime.newInstance(Long.valueOf(startDate)).date(),
            End_Date__c = DateTime.newInstance(Long.valueOf(endDate)).date()
        );

        if (null != allocationId) {
            allocation.Id = allocationId;
        } else {
            allocation.Name = 'New';
            if (null != projectId) {
                allocation.Project__c = projectId;
            }

            if (null != resourceId) {
                allocation.Resource__c = resourceId;
            }
        }

        upsert allocation;
    }
}