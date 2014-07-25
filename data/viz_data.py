# ValueError: Unrecognized backend string "qtagg": valid strings are ['pdf', 'pg
# f', 'Qt4Agg', 'GTK', 'GTKAgg', 'ps', 'agg', 'cairo', 'MacOSX', 'GTKCairo', 'WX
# Agg', 'template', 'TkAgg', 'GTK3Cairo', 'GTK3Agg', 'svg', 'WebAgg', 'CocoaAgg'
# , 'emf', 'gdk', 'WX']                                                         


import matplotlib
matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
from matplotlib import cm
from pymongo import MongoClient
import numpy as np
from scipy.interpolate import Rbf, griddata, interp2d
import geojson
import json
import csv
import logging
logger = logging.getLogger(__name__)


LONG_LIMITS = [-7, 2]
LAT_LIMITS = [50.5, 59]
LONG_DEGS = LONG_LIMITS[1] - LONG_LIMITS[0]
LAT_DEGS = LAT_LIMITS[1] - LAT_LIMITS[0]

class WeatherGetter(object):
    
    def __init__(self, dbname='uk_weather_stations'):
        mc = MongoClient() 
        weather_data = mc.viz[dbname]
        ws = weather_data.find()
        logger.debug('Fetched %d weather-records'%ws.count())
        self.aggdata = []
        for w in ws:
            self.aggdata += w['data']

    def get_month_year(self, mm, yyyy):
        datestring = '%s:01:%s'%(mm, yyyy)
        d = [d for d in self.aggdata if d['date'] == datestring]
        return d

    @classmethod
    def get_xyz(cls, station_list, col):
        x = []; y = []; z = []
        for s in station_list:
            if s[col] == '---':
                continue
            try:
                z.append(float(s[col].strip('*$#')))
            except ValueError:
                logger.error('Invalid Value for station %s: %s'%(repr(s), s[col]))
                continue
            x.append(s['coords'][1])
            y.append(s['coords'][0])

        return x, y, z

    def get_month_year_interp(self, mm, yyyy, col='sun', grid_res_deg=0.3):
        data = self.get_month_year(mm, yyyy)
        x, y, z = self.get_xyz(data, col)
        interp = interp2d(x, y, z)
        fc = geojson.FeatureCollection([])
        for i, lat in enumerate(np.arange(LAT_LIMITS[0], LAT_LIMITS[1]+0.001, grid_res_deg)):
            for j, lng in enumerate(np.arange(LONG_LIMITS[0], LONG_LIMITS[1]+0.001, grid_res_deg)):
                col_val= interp(lat, lng)
                logger.debug('lat/long: %4.2f/%4.2f, val: %4.2f'%(lat, lng, col_val))
                d = grid_res_deg/2
                fc.features.append(
                    geojson.Feature(
                        id='%d_%d'%(i, j), 
                        # geometry=geojson.Point([lat, lng]),
                        geometry=geojson.Polygon([[lat-d, lng-d], [lat-d, lng+d], [lat+d, lng+d], [lat+d, lng-d]]),
                        properties={col:interp(lat, lng), 'w':grid_res_deg/2}
                        )
                    )


    def get_griddata_month_year(self, mm, yyyy, col='sun', method='linear', points_per_degree=3):
        station_list = self.get_month_year(mm, yyyy)
        x, y, z = WeatherGetter.get_xyz(station_list, col) 
        
        points = np.array([x, y]).T
        grid_x, grid_y = np.mgrid[LONG_LIMITS[0]:LONG_LIMITS[1]:complex(points_per_degree * (LONG_LIMITS[1] - LONG_LIMITS[0])), LAT_LIMITS[0]:LAT_LIMITS[1]:complex(points_per_degree * (LAT_LIMITS[1] - LAT_LIMITS[0]))]
        grid_z = griddata(points, np.array(z), (grid_x, grid_y), method=method)
        logger.debug('Grid shape: %s from %d station readings'%(repr(grid_z.shape), len(x))) 
        return grid_x, grid_y, grid_z, points

    def make_geojson_collection(self, grid_x, grid_y, grid_z, points, col, grid_width):
        xdim, ydim = grid_z.shape 
        points = np.array([grid_x, grid_y, grid_z]).T.reshape([xdim*ydim, 3])
        d = grid_width/2
        fc = geojson.FeatureCollection([])
        for i, p in enumerate(points):
            # logger.debug('lat/long: %4.2f/%4.2f, val: %4.2f'%(lat, lng, col_val))
            
            lat = p[0]; lng=p[1]
            fc.features.append(
                geojson.Feature(
                    id='%d'%(i), 
                    # geometry=geojson.Point([p[0], p[1]]),
                    geometry=geojson.Polygon([[[lat-d, lng-d], [lat-d, lng+d], [lat+d, lng+d], [lat+d, lng-d], [lat-d, lng-d]]]),
                    properties={'value': str(p[2]), 'w':str(grid_width)}
                    )
                )
            
        return fc
    
    def get_geojson_month_year(self, mm, yyyy, col='sun', method='linear', points_per_degree=3):
        X, Y, Z, ps = self.get_griddata_month_year(mm, yyyy, col, method, points_per_degree)
        collection = self.make_geojson_collection(X, Y, Z, ps, col, 1.0/points_per_degree)
        return collection
    
    def date_range_to_csv(self, mm, yyyy, col='sun', method='linear', points_per_degree=3):
        
        with open('data/station_data_%s.csv'%col, 'w') as f: 
            grid = self.get_geojson_month_year('01', '1970', points_per_degree=points_per_degree)
            writer = csv.writer(f) 
            writer.writerow(['date'] + [gp.id for gp in grid.features])
            for y in yyyy:
                for m in mm:
                    ym = self.get_geojson_month_year('%02d'%m, str(y), col, method, points_per_degree)
                    vals = [f.properties['value'] for f in ym.features]
                    writer.writerow(['%02d:01:%d'%(m, y)] + vals)
        
                 
def get_meshgrid(station_list, col='sun', points_per_degree=25):
    limits = [(50.0, 58.5), (-7.0, 1.8)]

    x, y, z = WeatherGetter.get_xyz(station_list, col) 
    XI, YI = np.meshgrid(
        np.linspace(limits[1][0], limits[1][1], points_per_degree * (limits[1][1] - limits[1][0])),
        np.linspace(limits[0][0], limits[0][1], points_per_degree * (limits[0][1] - limits[0][0]))
        )
    rbf = Rbf(x, y, z, epsilon=2)
    ZI = rbf(XI, YI)
    return (x, y, z), (XI, YI, ZI)


def plot_rbf(x, y, z, XI, YI, ZI):
    n = plt.Normalize(-2., 2.)
    plt.subplot(1, 1, 1)
    plt.pcolor(XI, YI, ZI, cmap=cm.jet)
    plt.scatter(x, y, 100, z, cmap=cm.jet)
    plt.title('RBF interpolation - multiquadrics')
    #plt.xlim(-2, 2)
    #plt.ylim(-2, 2)
    plt.colorbar()

def plot_griddata(grid_z, points,x_lim=LONG_LIMITS, y_lim=LAT_LIMITS, title='Linear'):
    plt.subplot(121)
    #plt.imshow(func(grid_x, grid_y).T, extent=(0,1,0,1), origin='lower')
    plt.plot(points[:,0], points[:,1], 'k.', ms=1)
    plt.title('Original')
    plt.subplot(122)
    plt.imshow(grid_z.T, extent=(x_lim[0],x_lim[1], y_lim[0], y_lim[1]), origin='lower')
    plt.title(title)
    # plt.subplot(223)
    # plt.imshow(grid_z1.T, extent=(x_lim[0],x_lim[1], y_lim[0], y_lim[1]), origin='lower')
    # plt.title('Linear')
    # plt.subplot(224)
    # plt.imshow(grid_z2.T, extent=(x_lim[0],x_lim[1], y_lim[0], y_lim[1]), origin='lower')
    # plt.title('Cubic')
    plt.gcf().set_size_inches(6, 6)
    print 'here'
    plt.show()


def test_griddata():
    wg = WeatherGetter()
    month_slice = wg.get_month_year('12', '1972')
    grid_x, grid_y, grid_z, points = get_griddata(month_slice)
    plot_griddata(grid_z, points)
    
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(filename)s %(funcName)s %(lineno)d  (%(levelname)s)\t: %(message)s", datefmt='%Y-%m-%d %H:%M:%S')

    wg = WeatherGetter()
    # X, Y, Z, points = wg.get_griddata_month_year('12', '1972')
    # MONTH = '12'; YEAR = '1982'
    # coll = wg.get_geojson_month_year(MONTH, YEAR)
    # jsonstr = geojson.dumps(coll)
    # geojson.dump(coll, open('data/gridpoints.json', 'wb'))
    wg.date_range_to_csv(range(1, 12, 1), range(1999, 2011), 'sun') 
    wg.date_range_to_csv(range(1, 12, 1), range(1999, 2011), 'rain') 
    wg.date_range_to_csv(range(1, 12, 1), range(1999, 2011), 'tmax') 
    # plot_griddata(Z, points)
    
    
