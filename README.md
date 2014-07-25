## Intro
The UK's Met-office provides historical climate data from thirty odd stations, some of which have been recording regional temperature, rainfall and sun-hours per-month since the 1880's. This data can be scraped from their web-site as raw-text files which, with a little cleaning, yield workable csv-files. Below is an attempt to visualize the output of these stations, interpolating their numbers to form a grid across the UK. Using the D3 visualization library this grid is superimposed on a map-projection of the UK.

The data files can get quite large so I've only sampled the last decade for the demo below. By pressing 'animate' one can sit back and watch the passing of the seasons or just click on the navbar below the maps to show a specific date.

## Running

    $ python -m SimpleHTTPServer

or, with nodejs

    npm install -g http-server
    http-server

## Data processing

The Python modules in '/data' assume the availability of scipy and numpy.


