(function(){
     
    var MAP_WIDTH = 360, //960,
    MAP_HEIGHT = 460,
    MAP_SCALE = 2400,
    NB_HEIGHT = 60,//1160;
    MONTH_NAMES = [ "January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December" ],
    animTimer,
    UPDATE_DT=2000,
    runAnim = function() {
        publish('maps', [1, true]);
    },
    DATA_DIR = typeof window.DATA_DIR !== 'undefined'? window.DATA_DIR: 'data/';
    
    $('#mapAnim').button();
    $("#mapAnim").click( function(event){
        event.preventDefault();
        if ($(this).hasClass("active") ) {
            clearInterval(animTimer);
            // $("#nav").animate({marginTop:"0px"}, 200);          
            $(this).removeClass("active")
            $(this).html('Animate');
        } else {
            animTimer = setInterval(runAnim, UPDATE_DT);
            // $("#nav").animate({marginTop:"-100px"}, 200);   
            $(this).addClass("active");
            $(this).html('Stop');
        }
        return false;
    });

    var Map = function(datafile, parent, title, channel, cb, width, height, scale) {
        var map = this;
        this.width = typeof width !== 'undefined'? width: MAP_WIDTH;
        this.height = typeof height !== 'undefined'? height: MAP_HEIGHT;
        this.scale = typeof scale !== 'undefined'? scale: MAP_SCALE;
        
        this.datafile = datafile;
        this.parent = parent;
        this.title = title;

        this.channel = channel;
        this.cb = cb;

        subscribe(channel, function(row, incFlag) {
            if(incFlag){row = (row + map.currentRow)%map.rowStats.av.length;}
            map.updateGrid(row);
        });
        this.currentRow = 0;

        this.svg = d3.select(parent).append("svg")
            .attr("width", this.width)
            .attr("height", this.height+NB_HEIGHT);

        this.svg.append('text').text(this.title)
            .attr('class', 'map-title')
            .attr('x', this.width/2)
            .attr('text-anchor', 'middle')
            .attr('y', this.height/8);
        
        this.projection = d3.geo.albers()
            .center([0, 55.4])
            .rotate([4.4, 0])
            .parallels([50, 60])
            .scale(this.scale)
            .translate([this.width / 2, this.height / 2]);
        
        this.path = d3.geo.path()
            .projection(this.projection); 

        this.parseDate = d3.time.format("%m:%d:%Y").parse;
        
        d3.json(DATA_DIR + "uk.json", function(error, uk) {
            var subunits = topojson.feature(uk, uk.objects.subunits);
            map.svg.append("path")
                .datum(subunits)
                .attr("d", map.path);

            map.svg.append("svg:clipPath")
                .attr('id', 'ukclip')
                .datum(subunits)
                .append('path') 
                .attr("d", map.path);

            map.svg.selectAll(".subunit")
                .data(topojson.feature(uk, uk.objects.subunits).features)
                .enter().append("path")
                .attr("class", function(d) { return "subunit " + d.id; })
                .attr("d", map.path);

            map.svg.append("path")
                .datum(topojson.mesh(uk, uk.objects.subunits, function(a, b) { return a !== b && a.id !== "IRL"; }))
                .attr("d", map.path)
                .attr("class", "subunit-boundary");
            
            map.svg.append("path")
                .datum(topojson.mesh(uk, uk.objects.subunits, function(a, b) { return a === b && a.id === "IRL"; }))
                .attr("d", map.path)
                .attr("class", "subunit-boundary IRL");

            map.initGrid();
        });
    };

    Map.prototype = {
        initGrid: function() {
            var map = this;
            d3.json(DATA_DIR + 'gridpoints.json', function(error, json) {
                console.log(error);
                map.grid = map.svg.append("g")
                    .attr("clip-path", function() {
                        return 'url(#ukclip)';
                    })
                ;
                map.gridpoints = map.grid.selectAll('.gridpoints')
                    .data(json.features)
                    .enter().append("g")
                    .attr("class", "gridpoint")
                    .attr("id", function(d) {
                        return d.id;  
                    })
                    .append("path")
                    .attr('stroke-width', '2px')
                    .attr("d", d3.geo.path().projection(map.projection))
                    // .attr("clip-path", function() {
                    //     return 'url(#ukclip)';
                    // })
                ;

                d3.csv(map.datafile, function(error, data) {
                    map.data = data;
                    data.forEach(function(d) {
                        var i=0, keys = _.keys(d);
                        keys.pop('date');
                        for(; i< keys.length; i++){
                            d[keys[i]] = +d[keys[i]];
                        }
                        d.date = map.parseDate(d.date);
                    });
                    map.scaleData(data); 
                    map.makeNavBar();
                    dataline = data[map.currentRow];
                    console.log('Setting map to date ' + dataline.date);
                    map.updateGrid(map.currentRow);
                    if(map.cb){map.cb();}
                });
            });
            
        },
        
        scaleData: function() {
            // color-map to highest and lowest values
            var map=this, vals;

            this.getRowStats(); 
            min = d3.min(this.rowStats.min);
            max = d3.max(this.rowStats.max);
            this.gridColors = d3.scale.linear()
                .domain([min, min+max/2, max])
                .range(["#4575b4", "#ffffbf", "#a50026"])
                .interpolate(d3.interpolateHcl);
            var COLOR_BARS = 50, COLOR_BAR_WIDTH = 10, COLOR_BAR_HEIGHT = 2, COLOR_BAR_X = this.width-70, COLOR_BAR_Y = this.height - 200, CB_LABEL_INDICES=[0, 25, 49];
            this.cbscale = d3.scale.linear().domain([0, COLOR_BARS]).range([min, max]);
            this.colorbar = this.svg.selectAll('colorbar')
                .data(d3.range(COLOR_BARS))
                .enter().append('g')
                .attr("transform", "translate(" + COLOR_BAR_X + "," + COLOR_BAR_Y + ")");

            this.colorbar.append('rect')
                .attr('width', COLOR_BAR_WIDTH)
                .attr('height', COLOR_BAR_HEIGHT) 
                .attr('x', 0)
                .attr('y', function(d, i) {
                    return -i*COLOR_BAR_HEIGHT;
                })
                .attr('fill', function(d) {
                    return map.gridColors(map.cbscale(d));
                })
            ;

            this.colorbar.append('text')
                .text(function(d, i) {
                    if(_.contains(CB_LABEL_INDICES, i)){
                        return parseInt(min + (max-min) * (i*1.0/COLOR_BARS), 10); 
                    }})
                 .attr("x", COLOR_BAR_WIDTH + 10)
                .attr("y", function(d, i) { return -i * COLOR_BAR_HEIGHT;})
                .attr("dy", '.3em')
                .attr('class', 'cb-text');
                      
        },

        makeNavBar: function() {
            var map=this, nbscale, NAVBAR_WIDTH = this.width - 40, NAVBAR_HEIGHT = 20, NAVBAR_X = 20, NAVBAR_Y = this.height,
            NB_AXIS_X, NB_AXIS_Y;
            this.x = d3.time.scale().range([0, NAVBAR_WIDTH]);
            this.xAxis = d3.svg.axis().scale(this.x).orient("bottom").ticks(5);
            this.x.domain(d3.extent(this.data, function(d) { return d.date; }));
            // this.getRowStats();
            nbscale = d3.scale.linear().domain([0, this.rowStats.av.length]).range([0, NAVBAR_WIDTH]);
            
            this.navbar = this.svg.selectAll('navbar')
                .data(this.rowStats.av, function(d, i) {
                    return i;
                })
                .enter().append('g')
                .attr("transform", "translate(" + NAVBAR_X + "," + NAVBAR_Y + ")");

            this.navbar.append('rect')
                .attr('width', NAVBAR_WIDTH/this.rowStats.av.length)
                .attr('height', NAVBAR_HEIGHT) 
                .attr('x', function(d, i) {return nbscale(i);})
                .attr('y', 0)
                .attr('fill', function(d) {
                    return map.gridColors(d);
                })
                .attr('id', function(d, i) {
                    return 'nb_' + i;
                })
                .attr('cursor', 'pointer')
                .on('click', function(d, i) {
                   // map.updateGrid(i);
                    publish(map.channel, [i]);
                })
            ;

            this.svg.append('g')
                .attr("class", "x axis")
                .attr("transform", "translate(" + NAVBAR_X + "," + (NAVBAR_Y+NAVBAR_HEIGHT)  + ")")
                .call(this.xAxis);
            
        },
        
        updateGrid: function(row) {
            var dataline = this.data[row],
            map = this;
            d3.select(this.parent + ' #nb_' + this.currentRow).style('stroke', null);
            d3.select(this.parent + ' #nb_' + row).style('stroke', 'red');
            this.currentRow = row;
            console.log('Setting map to date ' + dataline.date);
            $('#subtitle').text(MONTH_NAMES[dataline.date.getMonth()] + ' ' + dataline.date.getFullYear());
            this.gridpoints
                .attr('fill', function(d, i) {
                    if(isNaN(dataline[i])){return 'white';}
                    return map.gridColors(parseFloat(dataline[i]));
                })
                .attr('stroke', function(d, i) {
                    if(isNaN(dataline[i])){return 'white';}
                    return map.gridColors(parseFloat(dataline[i]));
                });
            
            
        },

        getRowStats: function() {
            var i=0, a, av,
            notanumber = function(num){return isNaN(num);};
            this.rowStats = {av:[], min:[], max:[]};
            
            for(;i<this.data.length; i++){
                a =  _.values(_.omit(this.data[i], ['date']));
                a = _.reject(a, notanumber);
                av = d3.sum(a)/a.length; 
                this.rowStats.av.push(av);
                this.rowStats.min.push(d3.min(a));
                this.rowStats.max.push(d3.max(a));
                
            }
            return this.rowStats;
        }
        
        
    };

    var setTitles = function() {
        var dateLimits = d3.extent(this.data, function(d) {
            return d.date;
        }); 
        $('#data-sample').text('Data Sample from ' + dateLimits[0].getFullYear() + ' to ' + dateLimits[1].getFullYear());
    };
    
    maps = [];
    maps.push(new Map(DATA_DIR + 'station_data_sun.csv', '#vizsun', 'Hours of sunshine per month', 'maps', setTitles)); 
    maps.push(new Map(DATA_DIR + 'station_data_rain.csv', '#vizrain', 'Milimetres of rain per month', 'maps')); 
    maps.push(new Map(DATA_DIR + 'station_data_tmax.csv', '#viztmax', 'Maximum temp (deg. celcius)', 'maps')); 
    
    
    // d3.csv("data/station_data.csv", function(error, data) {
        
    //     d3.select('#slider').call(
    //         d3.slider().min(0).max(data.length-1).on("slide", function(evt, value) {
    //             _.invoke(maps, 'updateGrid', [value]);
    //         }));
    // });
    
})();
