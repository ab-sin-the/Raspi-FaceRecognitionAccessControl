function init() {
    Vue.component('toDelName', {
        template: '\
          <div>\
            {{ Name }}\
            <button class="deleteButton" v-on:click="$emit(\'remove\')">Del</button>\
          </div>\
        ',
        props: ['Name']
    });

    var app = new Vue({
        el: '#allowBox',
        data: {
            nameElement: undefined,
            allowedName: [],
            isAdding: false,
            functionAppNameSet: false,
            functionAppName: "",
            newName: ""
        },
        computed: {
            
        },
        methods: {
            addNewStep1(){
                this.isAdding = true;
            },
            addNewStep2(){
                if (this.newName === ""){
                    alert('No name found.');
                }
                if (this.allowedName.indexOf(this.newName) >= 0){
                    alert('This person exists!')
                }
                else{
                    this.allowedName.push(this.newName);
                    var url = `https://${this.functionAppName}.azurewebsites.net/api/raspberrypi-state?action=add&name=${this.newName}`;
                    this.$http.jsonp(url);
                    this.isAdding = false;
                }
            },
            deleteName(item){
                var deleteName = this.allowedName[item];
                var url = `https://${this.functionAppName}.azurewebsites.net/api/raspberrypi-state?action=delete&name=${deleteName}`;
                this.$http.jsonp(url);
                this.allowedName.splice(item, 1);
            },
            connectApp(){
                this.functionAppNameSet = true;
            }
        }
    });
}





init();