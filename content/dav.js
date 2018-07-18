"use strict";

/**
 * Implements the TbSync interface for external provider extensions.
 */
var dav = {
    bundle: Services.strings.createBundle("chrome://dav4tbsync/locale/dav.strings"),
    prefSettings: Services.prefs.getBranch("extensions.dav4tbsync."),



    /**
     * Called during load of external provider extension to init provider.
     *
     * @param lightningIsAvail       [in] indicate wheter lightning is installed/enabled
     */
    init: Task.async (function* (lightningIsAvail)  {
        //load overlays or do other init stuff, use lightningIsAvail to init stuff if lightning is installed
    }),



    /**
     * Returns location of 16x16 pixel provider icon.
     */
    getProviderIcon: function () {
        return "chrome://dav4tbsync/skin/sabredav16.png";
    },



    /**
     * Return object which contains all possible fields of a row in the accounts database with the default value if not yet stored in the database.
     */
    getNewAccountEntry: function () {
        let row = {
            "account" : "",
            "accountname": "",
            "provider": "dav",
            "lastsynctime" : "0", 
            "status" : "disabled", //global status: disabled, OK, syncing, notsyncronized, nolightning, ...
            "servertype": "custom",
            "authMethod" :"",
            "authOptions" :"",
            "host" : "",
            "user" : "",
            "https" : "1",
            "autosync" : "0",
            "downloadonly" : "0",            
            //some example options
            "syncdefaultfolders" : "1",
            "displayoverride" : "0",
            "seperator" : "44",            
            }; 
        return row;
    },




    /**
     * Return object which contains all possible fields of a row in the folder database with the default value if not yet stored in the database.
     */
    getNewFolderEntry: function (account) {
        let folder = {
            "account" : account,
            "folderID" : "",
            "name" : "",
            "type" : "",
            "target" : "",
            "targetName" : "",
            "targetColor" : "",
            "selected" : "",
            "lastsynctime" : "",
            "status" : "",
            "parentID" : "",
            "downloadonly" : tbSync.db.getAccountSetting(account, "downloadonly"), //each folder has its own settings, the main setting is just the default,
            "cached" : "0"};
        return folder;
    },



    /**
     * Return the thunderbird type (tb-contact, tb-event, tb-todo) for a given folder type of this provider. A provider could have multiple 
     * type definitions for a single thunderbird type (default calendar, shared address book, etc), this maps all possible provider types to
     * one of the three thunderbird types.
     *
     * @param type       [in] provider folder type
     */
    getThunderbirdFolderType: function(type) {
        switch (type) {
            case "carddav": 
                return "tb-contact";
            case "caldav":
                return "tb-event";
            default:
                return "unknown ("+type + ")";
        };
    },



    /**
     * Is called everytime an account of this provider is enabled in the manager UI, set/reset database fields as needed.
     *
     * @param account       [in] account which is being enabled
     */
    enableAccount: function (account) {
        db.setAccountSetting(account, "status", "notsyncronized");
        db.setAccountSetting(account, "lastsynctime", "0");

        // reset custom values
        //db.setAccountSetting(account, "policykey", 0);
        //db.setAccountSetting(account, "foldersynckey", "");
    },



    /**
     * Is called everytime an account of this provider is disabled in the manager UI, set/reset database fields as needed and
     * remove/backup all sync targets of this account.
     *
     * @param account       [in] account which is being disabled
     */
    disableAccount: function (account) {
        db.setAccountSetting(account, "status", "disabled");

        // reset custom values
        //db.setAccountSetting(account, "policykey", 0);
        //db.setAccountSetting(account, "foldersynckey", "");

        //remove all folders from DB and remove associated targets (caches all folder settings to be used on next re-enable) 
        tbSync.removeAllFolders(account);
    },



    /**
     * Is called if TbSync needs to create a new thunderbird address book associated with an account of this provider.
     *
     * @param newname       [in] name of the new address book
     * @param account       [in] id of the account this address book belongs to
     * @param folderID      [in] id of the folder this address book belongs to (sync target)
     */
    createAddressBook: function (newname, account, folderID) {
        //This example implementation is using the standard address book, but you may use another one
        let abManager = Components.classes["@mozilla.org/abmanager;1"].getService(Components.interfaces.nsIAbManager);

        return abManager.newAddressBook(newname, "", 2);
    },



    /**
     * Is called if TbSync needs to create a new lightning calendar associated with an account of this provider.
     *
     * @param newname       [in] name of the new calendar
     * @param account       [in] id of the account this calendar belongs to
     * @param folderID      [in] id of the folder this calendar belongs to (sync target)
     * @param color         [in] color for this calendar, picked by TbSync - if the provider provides a
     *                           color information himself, store it in the folder DB and access it here
     *                           directly via account and folderID
     */
    createCalendar: function(newname, account, folderID, color) {
        //This example implementation is using the standard storage calendar, but you may use another one
        let calManager = cal.getCalendarManager();
        let accountdata = tbSync.db.getAccount(account);
        let password = tbSync.getPassword(accountdata);
        let user = accountdata.user;
        
        //Create the new standard calendar with a unique name
        let hostport = "http" + (accountdata.https ? "s" : "") + "://" + accountdata.host;
        let url = dav.tools.parseUri(hostport + folderID);
    
        let newCalendar = calManager.createCalendar("caldav", url);
        newCalendar.id = cal.getUUID();
        newCalendar.name = newname;

        newCalendar.setProperty("color", color); //any chance to get the color from the provider? pass via folderSetting
        newCalendar.setProperty("calendar-main-in-composite", true);

        let authOptions = dav.tools.getAuthOptions(accountdata.authOptions);
        tbSync.setLoginInfo(hostport, authOptions.realm, user, password);
        
        calManager.registerCalendar(newCalendar);            
        return newCalendar;
    },



    /**
     * Is called if TbSync needs to find contacts in the global address list (GAL / directory) of an account associated with this provider.
     * It is used for autocompletion while typing something into the address field of the message composer and for the address book search,
     * if something is typed into the search field of the Thunderbird address book.
     *
     * TbSync will execute this only for queries longer than 3 chars.
     *
     * @param account       [in] id of the account which should be searched
     * @param currentQuery  [in] search query
     */
    /* Not supported by CardDAV
        abServerSearch: Task.async (function* (account, currentQuery)  {
        //generating example data
        let galdata = [];
    
                let resultset = {};
                resultset.properties = {};                    
                //any property defined here will be added to the found contacts card 
                resultset.properties["FirstName"] = "DAV First";
                resultset.properties["LastName"] = "LAST";
                resultset.properties["DisplayName"] = "FIRST LAST";
                resultset.properties["PrimaryEmail"] = "user@inter.net"

                resultset.autocomplete = {};                    
                resultset.autocomplete.value = "DAV First Last" + " <" + "user@inter.net" + ">";
                resultset.autocomplete.account = account;
                    
                galdata.push(resultset);
        
        return galdata;
    }),*/



    /**
     * Is called if TbSync needs to synchronize an account.
     *
     * @param syncdata      [in] object that contains the account and maybe the folder which needs to worked on
     *                           you are free to add more fields to this object which you need (persistent) during sync
     * @param job           [in] identifier about what is to be done, the standard job is "sync", you are free to add
     *                           custom jobs like "deletefolder" via your own accountSettings.xul
     */
    start: Task.async (function* (syncdata, job)  {                        
        try {
            switch (job) {
                case "sync":
                    //update folders avail on server and handle added, removed, renamed folders
                    yield dav.sync.folderList(syncdata);

                    //set all selected folders to "pending", so they are marked for syncing
                    tbSync.setSelectedFoldersToPending(syncdata.account);

                    //update folder list in GUI
                    Services.obs.notifyObservers(null, "tbsync.updateFolderList", syncdata.account);

                    //process all pending folders
                    yield dav.sync.allPendingFolders(syncdata);
                    break;
                                    
                default:
                    throw dav.sync.failed("unknown::"+job);
                    break;
            }
        } catch (e) {
            if (e.type == "dav4tbsync") tbSync.finishAccountSync(syncdata, e.message);
            else {
                tbSync.finishAccountSync(syncdata, "Javascript Error");
                Components.utils.reportError(e);
            }
        }            
    }),
    



    /**
     * Implements the TbSync UI interface for external provider extensions, 
     * only needed, if the standard TbSync UI logic is used (chrome://tbsync/content/manager/accountSettings.js).
     */
    ui: {

        /**
         * Returns array of all possible account options (field names of a row in the accounts database).
         */
        getAccountStorageFields: function () {
            return Object.keys(tbSync.dav.getNewAccountEntry()).sort();
        },




        /**
         * Returns array of all options, that should not lock while being connected.
         */
        getAlwaysUnlockedSettings: function () {
            return ["autosync"];
        },




        /**
         * Returns object with fixed entries for rows in the accounts database. This is useable for two cases:
         *   1. indicate which entries where retrieved by autodiscover, do not assign a value
         *   2. other special server profiles (like "outlook") which the user can select during account creation with predefined values
         * In either case, these entries are not editable in the UI by default,but the user has to unlock them.
         *
         * @param servertype       [in] return fixed set based on the given servertype
         */
        getFixedServerSettings: function(servertype) {
            let settings = {};
            switch (servertype) {
                case "auto":
                    //settings["host"] = null;
                    //settings["https"] = null;
                    break;
            }
            return settings;
        },




        /**
         * Is called before the context menu of the folderlist is shown, allows to 
         * show/hide custom menu options based on selected folder
         *
         * @param document       [in] document object of the account settings window
         * @param folder         [in] folder databasse object of the selected folder
         */
        onFolderListContextMenuShowing: function (document, folder) {
        },




        /**
         * Returns an array of folderRowData objects, containing all information needed 
         * to fill the folderlist. The content of the folderRowData object is free to choose,
         * it will be passed back to addRowToFolderList() and updateRowOfFolderList()
         *
         * @param account        [in] account id for which the folder data should be returned
         */
        getSortedFolderData: function (account) {
            let folderData = [];
            let folders = tbSync.db.getFolders(account);
            let folderIDs = Object.keys(folders);

            for (let i=0; i < folderIDs.length; i++) {
                folderData.push(tbSync.dav.ui.getFolderRowData(folders[folderIDs[i]]));
            }
            return folderData;
        },




        /**
         * Returns a folderRowData object, containing all information needed to fill one row
         * in the folderlist. The content of the folderRowData object is free to choose, it
         * will be passed back to addRowToFolderList() and updateRowOfFolderList()
         *
         * Use tbSync.getSyncStatusMsg(folder, syncdata, provider) to get a nice looking 
         * status message, including sync progress (if folder is synced)
         *
         * @param folder         [in] folder databasse object of requested folder
         * @param syncdata       [in] optional syncdata obj send by updateRowOfFolderList(),
         *                            needed to check if the folder is currently synced
         */        
        getFolderRowData: function (folder, syncdata = null) {
            let rowData = {};
            rowData.folderID = folder.folderID;
            rowData.selected = (folder.selected == "1");
            rowData.type = folder.type;
            rowData.name = folder.name;
            rowData.status = tbSync.getSyncStatusMsg(folder, syncdata, "dav");

            return rowData;
        },
    



        /**
         * Is called to add a row to the folderlist.
         *
         * @param document       [in] document object of the account settings window
         * @param newListItem    [in] the listitem of the row, where row items should be added to
         * @param rowData        [in] rowData object with all information needed to add the row
         */        
        addRowToFolderList: function (document, newListItem, rowData) {
            //add folder type/img
            let itemTypeCell = document.createElement("listcell");
            itemTypeCell.setAttribute("class", "img");
            itemTypeCell.setAttribute("width", "24");
            itemTypeCell.setAttribute("height", "24");
                let itemType = document.createElement("image");
                itemType.setAttribute("src", tbSync.dav.ui.getTypeImage(rowData.type));
                itemType.setAttribute("style", "margin: 4px;");
            itemTypeCell.appendChild(itemType);
            newListItem.appendChild(itemTypeCell);

            //add folder name
            let itemLabelCell = document.createElement("listcell");
            itemLabelCell.setAttribute("class", "label");
            itemLabelCell.setAttribute("width", "145");
            itemLabelCell.setAttribute("crop", "end");
            itemLabelCell.setAttribute("label", rowData.name);
            itemLabelCell.setAttribute("tooltiptext", rowData.name);
            itemLabelCell.setAttribute("disabled", !rowData.selected);
            if (!rowData.selected) itemLabelCell.setAttribute("style", "font-style:italic;");
            newListItem.appendChild(itemLabelCell);

            //add folder status
            let itemStatusCell = document.createElement("listcell");
            itemStatusCell.setAttribute("class", "label");
            itemStatusCell.setAttribute("flex", "1");
            itemStatusCell.setAttribute("crop", "end");
            itemStatusCell.setAttribute("label", rowData.status);
            itemStatusCell.setAttribute("tooltiptext", rowData.status);
            newListItem.appendChild(itemStatusCell);
        },		




        /**
         * Is called to update a row of the folderlist.
         *
         * @param document       [in] document object of the account settings window
         * @param listItem       [in] the listitem of the row, which needs to be updated
         * @param rowData        [in] rowData object with all information needed to add the row
         */        
        updateRowOfFolderList: function (document, listItem, rowData) {
            tbSync.updateListItemCell(listItem.childNodes[1], ["label","tooltiptext"], rowData.name);
            tbSync.updateListItemCell(listItem.childNodes[2], ["label","tooltiptext"], rowData.status);
            if (rowData.selected) {
                tbSync.updateListItemCell(listItem.childNodes[1], ["style"], "font-style:normal;");
                tbSync.updateListItemCell(listItem.childNodes[1], ["disabled"], "false");
            } else {
                tbSync.updateListItemCell(listItem.childNodes[1], ["style"], "font-style:italic;");
                tbSync.updateListItemCell(listItem.childNodes[1], ["disabled"], "true");
            }
        },
        



        /**
         * Return the icon used in the folderlist to represent the different folder types
         *
         * @param type       [in] provider folder type
         */
        getTypeImage: function (type) {
            let src = ""; 
            switch (type) {
                case "carddav": 
                    src = "contacts16.png";
                    break;
                case "caldav":
                    src = "calendar16.png";
                    break;
            }
            return "chrome://tbsync/skin/" + src;
        }
   }
};

tbSync.includeJS("chrome://dav4tbsync/content/sync.js");
tbSync.includeJS("chrome://dav4tbsync/content/tools.js");